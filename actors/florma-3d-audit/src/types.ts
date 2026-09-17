/**
 * Shared shapes for the audit. These describe what the page-side
 * instrumentation in `telemetry.ts` reports back, so they are deliberately
 * plain and JSON-serialisable.
 */

export interface AuditInput {
  startUrls: Array<{ url: string }>;
  sampleSeconds?: number;
  settleMs?: number;
  viewportWidth?: number;
  viewportHeight?: number;
  deviceScaleFactor?: number;
  assetExtensions?: string[];
  navigationTimeoutSecs?: number;
  proxyConfiguration?: Record<string, unknown>;
  reportConnector?: string;
  deliveryTool?: string;
  deliveryArguments?: Record<string, unknown>;
}

/**
 * The input after defaults have been applied. Keeping this distinct from
 * `AuditInput` means the audit code never has to re-apply `?? 5` fallbacks and
 * cannot silently run with an undefined sampling window.
 */
export interface AuditSettings extends AuditInput {
  sampleSeconds: number;
  settleMs: number;
  assetExtensions: string[];
}

export interface WebglContextInfo {
  /** The context type that was requested, e.g. `webgl2`, `webgl`, `webgpu`. */
  contextType: string;
  isWebgl: boolean;
  glVersion?: string;
  glslVersion?: string;
  vendor?: string;
  renderer?: string;
  /**
   * True when `renderer` looks like a CPU rasteriser (SwiftShader, llvmpipe,
   * Mesa offscreen, Microsoft Basic Render Driver). Such a run tells you
   * nothing about real-device GPU performance, so the flag travels with the
   * data instead of being buried in a caveat.
   */
  softwareRenderingSuspect: boolean;
  limits?: Record<string, number | number[]>;
  contextLostAtSnapshot?: boolean;
}

export interface CanvasInfo {
  index: number;
  cssWidth: number;
  cssHeight: number;
  backingWidth: number;
  backingHeight: number;
  backingStoreBytes: number;
  contextTypes: string[];
  hasWebgl: boolean;
}

export interface FrameTiming {
  sampleSeconds: number;
  frames: number;
  fps: number;
  frameTimeMsP50: number;
  frameTimeMsP95: number;
  frameTimeMsMax: number;
  longFrames: number;
  longFrameThresholdMs: number;
  /** False when the page produced no animation frames at all. */
  measured: boolean;
}

export interface AssetEntry {
  url: string;
  transferSize: number;
  encodedBodySize: number;
  decodedBodySize: number;
  durationMs: number;
  initiatorType: string;
}

export interface ContextEvent {
  type: string;
  atMs: number;
  statusMessage?: string;
}

export interface FrameTelemetry {
  requestedUrl: string;
  finalUrl: string;
  title: string;
  webgl: {
    present: boolean;
    contextCount: number;
    contexts: WebglContextInfo[];
    drawCalls: number;
    textureUploads: number;
    bufferUploads: number;
    events: ContextEvent[];
    creationErrors: string[];
  };
  canvases: CanvasInfo[];
  frames: FrameTiming;
  assets: AssetEntry[];
  assetsTotalBytes: number;
  assetsTransferSizeReliable: boolean;
  heap: { usedBytes: number; limitBytes: number; usedRatio: number } | null;
  longTasks: { count: number; totalBlockingTimeMs: number } | null;
  userAgent: string;
  webgpuAvailable?: boolean;
  viewport: { width: number; height: number };
  deviceScaleFactor: number;
  /** Populated when this telemetry came from a child frame rather than the top page. */
  frameUrl?: string;
  isMainFrame?: boolean;
}

export interface UrlAuditResult {
  requestedUrl: string;
  status: 'succeeded' | 'failed';
  errorMessage?: string;
  runtimeMs: number;
  auditedAt: string;
  browserChannel: string;
  audit: FrameTelemetry | null;
  /** One entry per frame that contained instrumentation, main frame included. */
  framesAudited: number;
  childFramesWithWebgl: number;
  verdict: string;
  notes: string[];
  delivery?: DeliveryResult;
}

export interface DeliveryResult {
  attempted: boolean;
  connectorId?: string;
  tool?: string;
  ok: boolean;
  error?: string;
  availableTools?: string[];
}
