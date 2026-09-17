import type { Browser, Page } from 'playwright';
import { log } from 'apify';
import { AUDIT_GLOBAL, installPageInstrumentation } from './telemetry';
import { formatBytes, truncate } from './format';
import type {
  AssetEntry,
  AuditSettings,
  ContextEvent,
  FrameTelemetry,
  UrlAuditResult,
} from './types';

/**
 * Runs the audit for a single URL and returns one dataset record.
 *
 * A fresh browser context is used per URL so that storage, caches, service
 * workers and GPU context state cannot leak between audited pages.
 */
export async function auditUrl(
  browser: Browser,
  input: AuditSettings,
  url: string,
  browserChannel: 'chrome' | 'bundled-chromium',
): Promise<UrlAuditResult> {
  const startedAt = Date.now();
  const assetExtensions = input.assetExtensions;
  const context = await browser.newContext({
    viewport: { width: input.viewportWidth ?? 1440, height: input.viewportHeight ?? 900 },
    deviceScaleFactor: input.deviceScaleFactor ?? 1,
  });

  // addInitScript on the context (not the page) so the instrumentation is
  // present in every frame and survives client-side navigations.
  await context.addInitScript(installPageInstrumentation);

  const page = await context.newPage();
  const pageIssues: string[] = [];
  page.on('pageerror', (error) => {
    if (pageIssues.length < 50) pageIssues.push(`pageerror: ${String(error.message || error)}`);
  });
  page.on('requestfailed', (request) => {
    if (pageIssues.length >= 50) return;
    const errorText = request.failure()?.errorText ?? 'unknown';
    // Aborted requests are routine on real pages (analytics beacons, cancelled
    // prefetches, navigations). Recording them buried the genuine failures -
    // a blocked Google Analytics call was the only "issue" reported for
    // threejs.org before this filter existed.
    if (errorText === 'net::ERR_ABORTED') return;
    pageIssues.push(`requestfailed: ${truncate(request.url(), 100)} (${errorText})`);
  });

  try {
    const navigationTimeout = (input.navigationTimeoutSecs ?? 60) * 1000;
    await page.goto(url, { waitUntil: 'load', timeout: navigationTimeout });

    // Let late-mounting canvases and their first frames arrive.
    if (input.settleMs > 0) await page.waitForTimeout(input.settleMs);

    await sampleAllFrames(page, input.sampleSeconds * 1000);

    const frames = await collectFrameTelemetry(page, assetExtensions);
    const audit = aggregate(frames, url);
    const childFramesWithWebgl = frames.filter((f) => !f.isMainFrame && f.webgl.present).length;
    const { verdict, notes } = interpret(audit, frames, childFramesWithWebgl, pageIssues);

    return {
      requestedUrl: url,
      status: 'succeeded',
      runtimeMs: Date.now() - startedAt,
      auditedAt: new Date().toISOString(),
      browserChannel,
      audit,
      framesAudited: frames.length,
      childFramesWithWebgl,
      verdict,
      notes,
    };
  } catch (error) {
    return {
      requestedUrl: url,
      status: 'failed',
      errorMessage: (error as Error).message,
      runtimeMs: Date.now() - startedAt,
      auditedAt: new Date().toISOString(),
      browserChannel,
      audit: null,
      framesAudited: 0,
      childFramesWithWebgl: 0,
      verdict: 'failed',
      notes: pageIssues,
    };
  } finally {
    await context.close().catch(() => undefined);
  }
}

/**
 * Starts frame sampling in every frame concurrently, then waits once. Sampling
 * frames sequentially would multiply the wall-clock cost by the frame count.
 */
async function sampleAllFrames(page: Page, durationMs: number): Promise<void> {
  const results = await Promise.all(
    page.frames().map((frame) =>
      frame
        .evaluate(
          ({ name, duration }: { name: string; duration: number }) => {
            const api = (window as any)[name];
            return api ? api.sampleFrames(duration) : null;
          },
          { name: AUDIT_GLOBAL, duration: durationMs },
        )
        .catch(() => null),
    ),
  );
  const sampled = results.filter((result) => result !== null).length;
  log.info(`Sampled animation frames in ${sampled}/${page.frames().length} frame(s) for ${durationMs}ms.`);
}

/** Reads a snapshot out of every frame that has instrumentation installed. */
async function collectFrameTelemetry(page: Page, assetExtensions: string[]): Promise<FrameTelemetry[]> {
  const snapshots = await Promise.all(
    page.frames().map(async (frame) => {
      try {
        const snapshot = await frame.evaluate(
          ({ name, extensions }: { name: string; extensions: string[] }) => {
            const api = (window as any)[name];
            return api ? api.snapshot(extensions) : null;
          },
          { name: AUDIT_GLOBAL, extensions: assetExtensions },
        );
        return snapshot as unknown as FrameTelemetry | null;
      } catch {
        return null;
      }
    }),
  );
  return snapshots.filter((snapshot): snapshot is FrameTelemetry => Boolean(snapshot));
}

/**
 * Merges per-frame snapshots into one record.
 *
 * Counters (draw calls, uploads, contexts) are summed; asset entries are
 * de-duplicated by URL because the same file can be requested from more than
 * one frame. Timing, heap and long-task figures come from the main frame,
 * because a page's scroll/animation smoothness is driven by the top frame.
 */
export function aggregate(frames: FrameTelemetry[], requestedUrl: string): FrameTelemetry {
  const main = frames.find((frame) => frame.isMainFrame) ?? frames[0];
  const all = <T>(pick: (frame: FrameTelemetry) => T[]): T[] => frames.flatMap(pick);

  if (!main) {
    // No frame accepted the instrumentation (or the page exposed no frames).
    return {
      requestedUrl,
      finalUrl: requestedUrl,
      title: '',
      webgl: {
        present: false,
        contextCount: 0,
        contexts: [],
        drawCalls: 0,
        textureUploads: 0,
        bufferUploads: 0,
        events: [],
        creationErrors: ['Telemetry was not installed in any frame.'],
      },
      canvases: [],
      frames: {
        sampleSeconds: 0,
        frames: 0,
        fps: 0,
        frameTimeMsP50: 0,
        frameTimeMsP95: 0,
        frameTimeMsMax: 0,
        longFrames: 0,
        longFrameThresholdMs: 50,
        measured: false,
      },
      assets: [],
      assetsTotalBytes: 0,
      assetsTransferSizeReliable: false,
      heap: null,
      longTasks: null,
      userAgent: '',
      webgpuAvailable: false,
      viewport: { width: 0, height: 0 },
      deviceScaleFactor: 1,
      frameUrl: requestedUrl,
      isMainFrame: true,
    };
  }

  const dedupedAssets = Array.from(
    all((frame) => frame.assets)
      .reduce((byUrl, asset) => byUrl.set(asset.url, asset), new Map<string, AssetEntry>())
      .values(),
  );

  let canvasIndex = 0;
  const canvases = all((frame) => frame.canvases).map((canvas) => ({
    ...canvas,
    index: canvasIndex++,
  }));

  const events: ContextEvent[] = all((frame) => frame.webgl.events).sort((a, b) => a.atMs - b.atMs);

  // Prefer the main frame's sampling; otherwise the frame that actually
  // produced frames (an embedded viewer may be the only thing animating).
  const timingFrame = main.frames.measured
    ? main
    : frames
        .filter((frame) => frame.frames.measured)
        .sort((a, b) => b.frames.frames - a.frames.frames)[0];

  const longTaskFrame = main.longTasks
    ? main
    : frames
        .filter((frame) => frame.longTasks)
        .sort((a, b) => (b.longTasks?.totalBlockingTimeMs ?? 0) - (a.longTasks?.totalBlockingTimeMs ?? 0))[0];

  return {
    requestedUrl,
    finalUrl: main.finalUrl,
    title: main.title,
    webgl: {
      present: frames.some((frame) => frame.webgl.present),
      contextCount: frames.reduce((total, frame) => total + frame.webgl.contextCount, 0),
      contexts: all((frame) => frame.webgl.contexts),
      drawCalls: frames.reduce((total, frame) => total + frame.webgl.drawCalls, 0),
      textureUploads: frames.reduce((total, frame) => total + frame.webgl.textureUploads, 0),
      bufferUploads: frames.reduce((total, frame) => total + frame.webgl.bufferUploads, 0),
      events,
      creationErrors: Array.from(
        new Set(all((frame) => frame.webgl.creationErrors)),
      ),
    },
    canvases,
    frames: timingFrame ? timingFrame.frames : main.frames,
    assets: dedupedAssets,
    assetsTotalBytes: dedupedAssets.reduce(
      (total, asset) => total + (asset.decodedBodySize || 0),
      0,
    ),
    assetsTransferSizeReliable: dedupedAssets.some((asset) => asset.encodedBodySize > 0),
    heap: main.heap ?? frames.find((frame) => frame.heap)?.heap ?? null,
    longTasks: longTaskFrame?.longTasks ?? null,
    userAgent: main.userAgent,
    webgpuAvailable: frames.some((frame) => frame.webgpuAvailable),
    viewport: main.viewport,
    deviceScaleFactor: main.deviceScaleFactor,
    frameUrl: main.frameUrl,
    isMainFrame: true,
  };
}

/**
 * Turns raw telemetry into a verdict plus notes a human can act on.
 *
 * The point of this function is to stop meaningless numbers from being read as
 * performance data: when WebGL ran on a software rasteriser, the frame timing
 * is explicitly called out as non-representative, while the JS-level counters
 * that remain valid (draw calls, uploads) are flagged as trustworthy.
 */
export function interpret(
  audit: FrameTelemetry,
  frames: FrameTelemetry[],
  childFramesWithWebgl: number,
  pageIssues: string[],
): { verdict: string; notes: string[] } {
  const notes: string[] = [];
  const contexts = audit.webgl.contexts;
  const software = contexts.filter((context) => context.softwareRenderingSuspect);
  const lostEvents = audit.webgl.events.filter((event) => event.type === 'webglcontextlost');
  let verdict = 'no-webgl-detected';

  if (!audit.webgl.present) {
    if (audit.canvases.length === 0) {
      notes.push('No <canvas> elements were found in any frame.');
    } else {
      notes.push(
        `${audit.canvases.length} <canvas> element(s) found, but none requested a WebGL context.`,
      );
    }
    if (audit.webgl.creationErrors.length > 0) {
      notes.push(`Context creation errors: ${audit.webgl.creationErrors.slice(0, 5).join('; ')}`);
    }
    if (audit.frames.measured) {
      notes.push(
        `Animation frames were still produced (${audit.frames.fps} fps sampled over ` +
          `${audit.frames.sampleSeconds}s), so this page animates without WebGL.`,
      );
    }
  } else if (software.length > 0) {
    verdict = 'webgl-software-rendered';
    notes.push(
      `WebGL ran on a software rasteriser (${Array.from(
        new Set(software.map((context) => context.renderer)),
      ).join(', ')}). Frame timing below is NOT representative of real-device GPU ` +
        'performance and must not be reported as user-facing FPS.',
    );
    notes.push(
      'Draw-call and texture-upload counts remain valid: they are JS-level counters and do ' +
        'not depend on the GPU.',
    );
  } else {
    verdict = 'webgl-hardware-rendered';
  }

  if (contexts.some((context) => context.contextLostAtSnapshot)) {
    notes.push('At least one WebGL context was already lost when the snapshot was taken.');
  }
  if (lostEvents.length > 0) {
    notes.push(
      `webglcontextlost fired ${lostEvents.length} time(s). That is the event that surfaces as a ` +
        'blank canvas or a crashed tab on real devices.',
    );
  }
  if (audit.webgl.contextCount > 8) {
    notes.push(
      `${audit.webgl.contextCount} WebGL contexts exist across frames. Browsers evict the oldest ` +
        'live context past a small limit (~16), a common cause of "the 3D disappeared" bugs.',
    );
  }
  if (audit.webgl.contextCount > audit.canvases.length) {
    notes.push(
      `${audit.webgl.contextCount} WebGL context(s) were created but only ` +
        `${audit.canvases.length} <canvas> element(s) were found in the DOM. Contexts on ` +
        'shadow-DOM or detached canvases are caught by the getContext hook but not by a ' +
        'document query - threejs.org reports exactly this shape.',
    );
  }
  if (childFramesWithWebgl > 0) {
    notes.push(
      `A child frame (embedded viewer) contained WebGL; totals include ${childFramesWithWebgl} ` +
        'child frame(s) from ' +
        `${frames.length} frame(s) sampled.`,
    );
  }
  if (!audit.frames.measured) {
    notes.push('No animation frames were produced during the sampling window, so no frame timing is available.');
  } else if (audit.frames.longFrames > 0) {
    notes.push(
      `${audit.frames.longFrames} frame(s) took longer than ${audit.frames.longFrameThresholdMs}ms ` +
        `(p95 ${audit.frames.frameTimeMsP95}ms, worst ${audit.frames.frameTimeMsMax}ms).`,
    );
  }
  if (audit.assets.length > 0) {
    notes.push(
      `${audit.assets.length} 3D/immersive asset request(s) totalling ` +
        `${formatBytes(audit.assetsTotalBytes)} decoded.`,
    );
    if (!audit.assetsTransferSizeReliable) {
      notes.push(
        'Asset sizes could not be measured: the responses are cross-origin without a ' +
          'Timing-Allow-Origin header, so transferSize/encodedBodySize report 0.',
      );
    }
  }
  if (audit.heap && audit.heap.usedRatio > 0.8) {
    notes.push(
      `JS heap is at ${Math.round(audit.heap.usedRatio * 100)}% of its limit - a crash risk on ` +
        'real devices with less memory than this container.',
    );
  }
  if (audit.webgpuAvailable) {
    notes.push('navigator.gpu is present, so this page could also use WebGPU; only WebGL is instrumented here.');
  }
  if (pageIssues.length > 0) {
    notes.push(`${pageIssues.length} page issue(s) logged, first: ${pageIssues[0]}`);
  }

  return { verdict, notes };
}