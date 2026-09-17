import { formatBytes, truncate } from './format';
import type { FrameTelemetry, UrlAuditResult } from './types';

/**
 * Renders the run as Markdown, which is the format most MCP connectors want
 * (Notion pages, Slack messages, GitHub issues all accept Markdown).
 */
export function renderMarkdownReport(results: UrlAuditResult[], generatedAt: string): string {
  const lines: string[] = [
    '# 3D / WebGL page audit',
    '',
    `Generated: ${generatedAt}`,
    `Pages audited: ${results.length} (${results.filter((r) => r.status === 'succeeded').length} succeeded)`,
    '',
    '> Frame timing is measured under the renderer reported per page. When that',
    '> renderer is a software rasteriser (SwiftShader/llvmpipe), the timing says',
    '> nothing about real-device GPU performance. Draw-call and upload counts are',
    '> JS-level counters and stay valid either way.',
    '',
  ];

  for (const result of results) {
    lines.push(`## ${result.requestedUrl}`, '');
    lines.push(`- Status: **${result.status}** (${result.verdict})`);
    lines.push(`- Runtime: ${(result.runtimeMs / 1000).toFixed(1)}s | browser: ${result.browserChannel}`);
    lines.push(`- Frames instrumented: ${result.framesAudited} | child frames with WebGL: ${result.childFramesWithWebgl}`);

    if (result.status === 'failed' || !result.audit) {
      lines.push('', `**Error:** ${result.errorMessage ?? 'no telemetry collected'}`, '');
      if (result.notes.length > 0) {
        lines.push('Notes:', '', ...result.notes.map((note) => `- ${note}`), '');
      }
      continue;
    }

    const audit = result.audit;
    lines.push(
      '',
      '| Metric | Value |',
      '| --- | --- |',
      `| Title | ${truncate(audit.title || '(untitled)', 80)} |`,
      `| WebGL present | ${audit.webgl.present ? 'yes' : 'no'} |`,
      `| WebGL contexts | ${audit.webgl.contextCount} |`,
      `| Canvas elements | ${audit.canvases.length} |`,
      `| Draw calls (sampled window) | ${audit.webgl.drawCalls} |`,
      `| Texture uploads | ${audit.webgl.textureUploads} |`,
      `| Buffer uploads | ${audit.webgl.bufferUploads} |`,
      `| Frames / fps | ${audit.frames.frames} / ${audit.frames.fps} |`,
      `| Frame time p50 / p95 / max | ${audit.frames.frameTimeMsP50} / ${audit.frames.frameTimeMsP95} / ${audit.frames.frameTimeMsMax} ms |`,
      `| Long frames (>${audit.frames.longFrameThresholdMs}ms) | ${audit.frames.longFrames} |`,
      `| 3D assets | ${audit.assets.length} (${formatBytes(audit.assetsTotalBytes)}) |`,
      `| JS heap | ${audit.heap ? `${formatBytes(audit.heap.usedBytes)} of ${formatBytes(audit.heap.limitBytes)}` : 'unavailable'} |`,
      `| WebGPU available | ${audit.webgpuAvailable ? 'yes' : 'no'} |`,
      '',
    );

    lines.push('### GPU / renderer', '');
    if (audit.webgl.contexts.length === 0) {
      lines.push('No WebGL context was created.', '');
    } else {
      for (const context of audit.webgl.contexts) {
        lines.push(
          `- **${context.contextType}** | renderer: ${context.renderer ?? 'unknown'} | vendor: ${context.vendor ?? 'unknown'}` +
            `${context.softwareRenderingSuspect ? ' **(software rasteriser)**' : ''}`,
          `  - GL: ${context.glVersion ?? 'n/a'} | GLSL: ${context.glslVersion ?? 'n/a'} | lost at snapshot: ${context.contextLostAtSnapshot ?? 'n/a'}`,
          `  - Limits: ${renderLimits(context)}`,
        );
      }
      lines.push('');
    }

    if (audit.webgl.events.length > 0) {
      lines.push('### Context events', '');
      for (const event of audit.webgl.events.slice(0, 10)) {
        lines.push(`- ${event.atMs}ms: ${event.type}${event.statusMessage ? ` (${event.statusMessage})` : ''}`);
      }
      lines.push('');
    }

    if (audit.assets.length > 0) {
      lines.push('### 3D / immersive assets', '');
      lines.push('| URL | Decoded | Transfer | Duration |', '| --- | --- | --- | --- |');
      for (const asset of audit.assets.slice(0, 15)) {
        lines.push(
          `| ${truncate(asset.url, 90)} | ${formatBytes(asset.decodedBodySize)} | ` +
            `${asset.encodedBodySize ? formatBytes(asset.encodedBodySize) : 'unknown'} | ${asset.durationMs}ms |`,
        );
      }
      lines.push('');
    }

    lines.push('### Notes', '');
    lines.push(...(result.notes.length > 0 ? result.notes.map((note) => `- ${note}`) : ['- none']));
    lines.push('');
  }

  return lines.join('\n');
}

function renderLimits(context: FrameTelemetry['webgl']['contexts'][number]): string {
  const limits = context.limits;
  if (!limits || Object.keys(limits).length === 0) return 'not reported';
  const highlights = ['MAX_TEXTURE_SIZE', 'MAX_RENDERBUFFER_SIZE', 'MAX_VERTEX_ATTRIBS', 'MAX_TEXTURE_IMAGE_UNITS']
    .filter((key) => key in limits)
    .map((key) => `${key}=${JSON.stringify(limits[key])}`);
  const remaining = Object.keys(limits).length - highlights.length;
  return `${highlights.join(', ')}${remaining > 0 ? `, +${remaining} more` : ''}`;
}