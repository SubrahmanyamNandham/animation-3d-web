# 3D / WebGL Page Audit

Runs a page in headless Chromium with instrumentation injected *before* any page
script executes, then reports what the page actually does with WebGL. It exists
because the usual way of "auditing a 3D website" (a Lighthouse run) cannot see
any of this: Lighthouse reports lab scores and Core Web Vitals, and its dataset
contains no GPU, renderer, draw-call or frame-time fields at all.

## What it measures

| Output | Where it comes from |
| --- | --- |
| WebGL contexts created, per type (`webgl2`, `webgl`, `webgpu` presence) | hooked `HTMLCanvasElement.prototype.getContext` |
| GPU vendor / renderer strings | `WEBGL_debug_renderer_info` |
| GPU capability limits (`MAX_TEXTURE_SIZE`, `MAX_RENDERBUFFER_SIZE`, attribute/uniform/texture-unit counts, anisotropy) | `gl.getParameter` on the live context |
| Draw calls, texture uploads, buffer uploads | counters wrapped around the `WebGLRenderingContext` / `WebGL2RenderingContext` prototypes |
| Frame timing: fps, p50/p95/max frame time, long frames | `requestAnimationFrame` deltas over the sampling window |
| Context-loss and creation-error events | captured `webglcontextlost` / `webglcontextrestored` / `webglcontextcreationerror` |
| 3D asset weight (`.glb`, `.gltf`, `.ktx2`, `.hdr`, …) | `performance.getEntriesByType('resource')` |
| JS heap usage and long-task blocking time | `performance.memory`, `longtask` PerformanceObserver |

Canvas elements in child frames are instrumented too, so 3D embedded through an
iframe (Splash/Sketchfab-style viewers) is counted rather than silently missed.

## Read the caveats before trusting the numbers

Every record carries a `verdict` and a `notes` array that state these limits
explicitly, because the raw numbers are easy to misread:

- **Frame timing is not GPU performance.** On Apify this runs in cloud Chromium
  with no GPU, so WebGL falls back to SwiftShader. `verdict` will be
  `webgl-software-rendered` and the notes say the timing is not representative.
  Never publish those numbers as user-facing FPS.
- **Draw-call and upload counts stay valid** under software rendering - they are
  JS-level counters. This is the part of the output you can act on.
- **Cross-origin assets report zero bytes** unless the server sends
  `Timing-Allow-Origin`; `assetsTransferSizeReliable` is `false` in that case
  rather than reporting a misleading `0 B`.
- **Actor URLs cannot reach localhost.** Use a deployed or tunnelled URL.

## Input

| Field | Notes |
| --- | --- |
| `startUrls` | Pages to audit. |
| `sampleSeconds` | Frame sampling window per page (default 5s). |
| `settleMs` | Delay after load before sampling (default 3000ms). |
| `viewportWidth` / `viewportHeight` / `deviceScaleFactor` | Canvas backing-store size drives fill-rate cost. |
| `assetExtensions` | Which resource extensions count as 3D/immersive weight. |
| `navigationTimeoutSecs` | Navigation timeout. |
| `proxyConfiguration` | Only needed if the target blocks datacenter IPs. |
| `reportConnector` | Optional MCP connector to deliver the report through. |
| `deliveryTool` | Tool to call on that connector. Leave empty to just list the connector's tools. |
| `deliveryArguments` | Tool arguments; supports `{{reportMarkdown}}`, `{{reportJson}}`, `{{requestedUrl}}`, `{{verdict}}`. |

## Output

- **Default dataset**: one record per URL (`audit` holds the full telemetry,
  plus `verdict` and `notes`).
- **Key-value store**: `REPORT` (Markdown), `SUMMARY`, and `DELIVERY` when an MCP
  connector was used.

## Running it

```bash
# local
npm install          # add PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 to skip browsers
npx playwright install chrome   # any Chrome/Chromium for a local run
node dist/main.js    # or: npm start  (builds first)
```

Locally the Actor reads `storage/` for INPUT/dataset, or set
`APIFY_INPUT_KEY`/use `Actor.getInput` defaults. MCP delivery cannot work
locally - see below.

## Deploying

```bash
npm install -g apify-cli   # the CLI is not installed by default
apify login
cd actors/florma-3d-audit
apify push
```

The Dockerfile targets `apify/actor-node-playwright-chrome:22-slim` and copies
files with `--chown=myuser:myuser`, since the Apify base images run as the
non-root `myuser` user.

## MCP connector delivery

`reportConnector` is declared in `input_schema.json` with
`"resourceType": "mcpConnector"` and an `mcpServers` rule list. That list is both
the picker's eligibility filter and the runtime ceiling: the Apify MCP proxy
filters `tools/list` and rejects `tools/call` for any tool outside the declared
set. The current declaration is deliberately broad:

```json
"mcpServers": [{ "url": "*" }]
```

Tighten it before publishing - for example
`"tools": { "required": ["create_page", "post_*"] }` - so the Actor can only
reach the tools it is meant to. Delivery is only possible on the platform, which
injects `ACTOR_MCP_CONNECTOR_BASE_URL`; a missing value is reported as a
configuration error.
