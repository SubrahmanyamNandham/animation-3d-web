/**
 * Page-side instrumentation.
 *
 * `installPageInstrumentation` is serialised by Playwright and evaluated inside
 * the page *before* any page script runs (via `addInitScript`). It must
 * therefore be completely self-contained: no imports, no references to module
 * scope. Everything it needs is declared inside the function body.
 *
 * The same body runs in every frame, so canvases inside embedded viewers
 * (Splash/Sketchfab-style iframes) are captured too - the caller aggregates
 * snapshots across frames.
 */

/** Name of the global the instrumentation installs. Shared with `audit.ts`. */
export const AUDIT_GLOBAL = '__flormaAudit';

export function installPageInstrumentation(): void {
  // Must be a literal declared *inside* this function. Referring to the
  // module-scope AUDIT_GLOBAL above would be rewritten by TypeScript's
  // CommonJS emit into a property access on the CommonJS exports object, which
  // does not exist inside the page - so the injected script would die before
  // installing anything. `scripts/verify-init-script.mjs` guards against this.
  const globalName = '__flormaAudit';

  const w = window as any;
  if (w[globalName]) return;

  const SOFT_RENDERER = /swiftshader|llvmpipe|softpipe|software|basic render|mesa offscreen/i;
  const LIMIT_KEYS = [
    'MAX_TEXTURE_SIZE',
    'MAX_CUBE_MAP_TEXTURE_SIZE',
    'MAX_RENDERBUFFER_SIZE',
    'MAX_VIEWPORT_DIMS',
    'MAX_VERTEX_ATTRIBS',
    'MAX_VERTEX_UNIFORM_VECTORS',
    'MAX_FRAGMENT_UNIFORM_VECTORS',
    'MAX_VARYING_VECTORS',
    'MAX_TEXTURE_IMAGE_UNITS',
    'MAX_COMBINED_TEXTURE_IMAGE_UNITS',
    'MAX_VERTEX_TEXTURE_IMAGE_UNITS',
  ];
  const DRAW_METHODS = [
    'drawArrays',
    'drawElements',
    'drawArraysInstanced',
    'drawElementsInstanced',
    'drawRangeElements',
  ];
  const TEXTURE_METHODS = [
    'texImage2D',
    'texSubImage2D',
    'compressedTexImage2D',
    'compressedTexSubImage2D',
  ];
  const BUFFER_METHODS = ['bufferData', 'bufferSubData'];

  const startedAt = performance.now();
  const contexts: any[] = [];
  const events: any[] = [];
  const creationErrors: string[] = [];
  const longTaskEntries: any[] = [];
  const frameDeltas: number[] = [];
  const canvasTypes = new WeakMap<HTMLCanvasElement, string[]>();
  const counters = { drawCalls: 0, textureUploads: 0, bufferUploads: 0 };

  const safe = (fn: () => unknown): unknown => {
    try {
      return fn();
    } catch {
      return undefined;
    }
  };

  const note = (type: string, ev?: any) => {
    if (events.length >= 200) return;
    events.push({
      type,
      atMs: Math.round(performance.now() - startedAt),
      statusMessage: ev && typeof ev.statusMessage === 'string' ? ev.statusMessage : undefined,
    });
  };

  // These three events do not bubble, so they are captured at window in the
  // capture phase - otherwise a canvas created deeper in the page is missed.
  for (const type of ['webglcontextlost', 'webglcontextrestored', 'webglcontextcreationerror']) {
    window.addEventListener(type, (ev: Event) => note(type, ev), true);
  }

  if (typeof PerformanceObserver !== 'undefined') {
    safe(() => {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) longTaskEntries.push(entry);
      });
      observer.observe({ type: 'longtask', buffered: true } as any);
    });
  }

  const collectLimits = (gl: any): Record<string, number | number[]> => {
    const limits: Record<string, number | number[]> = {};
    for (const key of LIMIT_KEYS) {
      const pname = safe(() => gl[key]);
      if (typeof pname !== 'number') continue;
      const value: any = safe(() => gl.getParameter(pname));
      if (typeof value === 'number') limits[key] = value;
      else if (value && typeof value.length === 'number') limits[key] = Array.from(value as number[]);
    }
    const aniso: any = safe(() => gl.getExtension('EXT_texture_filter_anisotropic'));
    if (aniso) {
      const max: any = safe(() => gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT));
      if (typeof max === 'number') limits.MAX_TEXTURE_MAX_ANISOTROPY_EXT = max;
    }
    return limits;
  };

  const registerContext = (ctx: any, type: string) => {
    if (contexts.some((c) => c.ctx === ctx)) return;
    const isWebgl = /webgl/i.test(type);
    const dbg: any = isWebgl ? safe(() => ctx.getExtension('WEBGL_debug_renderer_info')) : null;
    const vendor = dbg ? safe(() => String(ctx.getParameter(dbg.UNMASKED_VENDOR_WEBGL))) : undefined;
    const renderer = dbg
      ? safe(() => String(ctx.getParameter(dbg.UNMASKED_RENDERER_WEBGL)))
      : undefined;
    contexts.push({
      ctx,
      contextType: type,
      isWebgl,
      glVersion: isWebgl ? safe(() => String(ctx.getParameter(ctx.VERSION))) : undefined,
      glslVersion: isWebgl
        ? safe(() => String(ctx.getParameter(ctx.SHADING_LANGUAGE_VERSION)))
        : undefined,
      vendor,
      renderer,
      // The renderer string decides whether the timing numbers mean anything,
      // so it is recorded next to them instead of left as a doc caveat.
      softwareRenderingSuspect: !!renderer && SOFT_RENDERER.test(renderer as string),
      limits: isWebgl ? collectLimits(ctx) : undefined,
    });
  };

  // Hook context creation. Assigning through `any` because the prototype
  // method's overloads cannot be satisfied by a generic wrapper.
  const originalGetContext = HTMLCanvasElement.prototype.getContext;
  (HTMLCanvasElement.prototype as any).getContext = function (type: string, ...rest: any[]) {
    const ctx = (originalGetContext as any).apply(this, [type, ...rest]);
    const known = canvasTypes.get(this) || [];
    if (!known.includes(type)) known.push(type);
    canvasTypes.set(this, known);
    if (ctx) registerContext(ctx, type);
    else if (creationErrors.length < 50) creationErrors.push(`getContext('${type}') returned null`);
    return ctx;
  };

  const wrapCounters = (
    proto: any,
    methods: string[],
    key: 'drawCalls' | 'textureUploads' | 'bufferUploads',
  ) => {
    if (!proto) return;
    for (const name of methods) {
      const original = proto[name];
      if (typeof original !== 'function') continue;
      proto[name] = function (...args: any[]) {
        counters[key] += 1;
        return original.apply(this, args);
      };
    }
  };

  if (typeof WebGLRenderingContext !== 'undefined') {
    wrapCounters(WebGLRenderingContext.prototype, DRAW_METHODS, 'drawCalls');
    wrapCounters(WebGLRenderingContext.prototype, TEXTURE_METHODS, 'textureUploads');
    wrapCounters(WebGLRenderingContext.prototype, BUFFER_METHODS, 'bufferUploads');
  }
  if (typeof WebGL2RenderingContext !== 'undefined') {
    wrapCounters(WebGL2RenderingContext.prototype, DRAW_METHODS, 'drawCalls');
    wrapCounters(WebGL2RenderingContext.prototype, TEXTURE_METHODS, 'textureUploads');
    wrapCounters(WebGL2RenderingContext.prototype, BUFFER_METHODS, 'bufferUploads');
  }

  /**
   * Samples frame deltas for `durationMs` using requestAnimationFrame. This
   * measures the pace at which frames are produced under the renderer in use -
   * it is not GPU frame time, and under software rendering it says nothing
   * about real-device performance. The caller reports the renderer next to it.
   */
  const sampleFrames = (durationMs: number) =>
    new Promise<void>((resolve) => {
      const start = performance.now();
      let last = start;
      let done = false;
      let guard: any;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(guard);
        resolve();
      };
      // Guard: a page that never requests an animation frame, or a throttled
      // tab, would otherwise hang the run forever.
      guard = setTimeout(finish, durationMs + 5000);
      const tick = (now: number) => {
        frameDeltas.push(now - last);
        last = now;
        if (now - start >= durationMs) finish();
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });

  const percentile = (values: number[], p: number) => {
    if (!values.length) return 0;
    const sorted = values.slice().sort((a, b) => a - b);
    const index = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
    return Math.round(sorted[index] * 100) / 100;
  };

  const snapshot = (assetExtensions: string[]) => {
    const wanted = (assetExtensions || []).map((extension) => extension.toLowerCase());
    const resources: any[] =
      (safe(() => performance.getEntriesByType('resource')) as any[]) || [];
    const assets = resources
      .filter((entry) => {
        const path = String(entry.name || '')
          .toLowerCase()
          .split('?')[0]
          .split('#')[0];
        return wanted.some((extension) => path.endsWith(extension));
      })
      .map((entry) => ({
        url: String(entry.name),
        transferSize: entry.transferSize || 0,
        encodedBodySize: entry.encodedBodySize || 0,
        decodedBodySize: entry.decodedBodySize || 0,
        durationMs: Math.round(entry.duration || 0),
        initiatorType: entry.initiatorType || '',
      }));

    const canvases = Array.from(document.querySelectorAll('canvas')).map((canvas, index) => {
      const types = canvasTypes.get(canvas) || [];
      const rect = safe(() => canvas.getBoundingClientRect()) as DOMRect | undefined;
      const backingWidth = canvas.width || 0;
      const backingHeight = canvas.height || 0;
      return {
        index,
        cssWidth: rect ? Math.round(rect.width) : 0,
        cssHeight: rect ? Math.round(rect.height) : 0,
        backingWidth,
        backingHeight,
        backingStoreBytes: backingWidth * backingHeight * 4,
        contextTypes: types,
        hasWebgl: types.some((type) => /webgl/i.test(type)),
      };
    });

    const deltas = frameDeltas.slice();
    const elapsed = deltas.reduce((total, delta) => total + delta, 0);
    const threshold = 50;
    const memory = ((safe(() => (performance as any).memory) as any) || null) as any;
    const blocking = longTaskEntries.reduce(
      (total, entry) => total + Math.max(0, (entry.duration || 0) - threshold),
      0,
    );

    return {
      requestedUrl: location.href,
      finalUrl: location.href,
      title: document.title,
      webgl: {
        present: contexts.some((c) => c.isWebgl),
        contextCount: contexts.length,
        // Raw context objects are deliberately not serialised - only plain
        // values above cross the Playwright boundary.
        contexts: contexts.map((c) => ({
          contextType: c.contextType,
          isWebgl: c.isWebgl,
          glVersion: c.glVersion,
          glslVersion: c.glslVersion,
          vendor: c.vendor,
          renderer: c.renderer,
          softwareRenderingSuspect: c.softwareRenderingSuspect,
          limits: c.limits,
          contextLostAtSnapshot: c.isWebgl
            ? safe(() => Boolean(c.ctx.isContextLost()))
            : undefined,
        })),
        drawCalls: counters.drawCalls,
        textureUploads: counters.textureUploads,
        bufferUploads: counters.bufferUploads,
        events,
        creationErrors,
      },
      canvases,
      frames: {
        sampleSeconds: Math.round(elapsed / 100) / 10,
        frames: deltas.length,
        fps: elapsed > 0 ? Math.round((deltas.length / elapsed) * 1000 * 100) / 100 : 0,
        frameTimeMsP50: percentile(deltas, 50),
        frameTimeMsP95: percentile(deltas, 95),
        frameTimeMsMax: deltas.length ? Math.round(Math.max(...deltas) * 100) / 100 : 0,
        longFrames: deltas.filter((delta) => delta > threshold).length,
        longFrameThresholdMs: threshold,
        measured: deltas.length > 0,
      },
      assets,
      assetsTotalBytes: assets.reduce((total, asset) => total + (asset.decodedBodySize || 0), 0),
      // Correctness note: cross-origin resources without a Timing-Allow-Origin
      // header report zero sizes, so this is false when every 3D asset did.
      assetsTransferSizeReliable: assets.length > 0 && assets.some((a) => a.encodedBodySize > 0),
      heap: memory
        ? {
            usedBytes: memory.usedJSHeapSize || 0,
            limitBytes: memory.jsHeapSizeLimit || 0,
            usedRatio: memory.jsHeapSizeLimit
              ? Math.round((memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 1000) / 1000
              : 0,
          }
        : null,
      longTasks:
        longTaskEntries.length > 0
          ? { count: longTaskEntries.length, totalBlockingTimeMs: Math.round(blocking) }
          : null,
      userAgent: navigator.userAgent,
      webgpuAvailable: Boolean(safe(() => (navigator as any).gpu)),
      viewport: { width: window.innerWidth, height: window.innerHeight },
      deviceScaleFactor: window.devicePixelRatio,
      frameUrl: location.href,
      isMainFrame: window.top === window,
    };
  };

  w[globalName] = { version: '0.1.0', sampleFrames, snapshot };
}