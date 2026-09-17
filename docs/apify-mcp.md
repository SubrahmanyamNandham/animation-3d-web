# Connecting this repo's AI agent to Apify (MCP)

This documents the Apify MCP wiring committed to this repo, so an AI coding
agent working on the Florma hero can search the Apify Store, run Actors, and
read their results without leaving the editor.

It also records what Apify's tooling **can and cannot** tell you about a 3D /
WebGL page, because a lot of circulating advice on that topic is wrong (see
[Reality checks](#reality-checks)).

- [What's committed here](#whats-committed-here)
- [Setup per client](#setup-per-client)
- [Authentication](#authentication)
- [Audit recipes](#audit-recipes)
- [Reality checks](#reality-checks)
- [Troubleshooting](#troubleshooting)

## What's committed here

| File | Client that reads it | Top-level key |
| --- | --- | --- |
| `.cursor/mcp.json` | Cursor (project-scoped) | `mcpServers` |
| `.vscode/mcp.json` | VS Code native agent mode | `servers` |
| `.mcp.json` | Claude Code (project-scoped) | `mcpServers` |

All three point at the hosted Apify MCP server:

```
https://mcp.apify.com
```

None of them contain a secret — they rely on OAuth (see
[Authentication](#authentication)), so they are safe to commit.

> **Cline does not read any of these files.** Cline manages MCP servers in its
> own settings. Use the Cline panel: **MCP Servers → Configure → Configure MCP
> Servers**, then add a remote server with transport `Streamable HTTP` and URL
> `https://mcp.apify.com`. See [Setup per client](#setup-per-client).

## Setup per client

### Cursor (project-scoped)

`.cursor/mcp.json` is already committed, so this works as soon as you open the
repo — no per-developer step:

```json
{
  "mcpServers": {
    "apify": {
      "url": "https://mcp.apify.com"
    }
  }
}
```

Restart Cursor (or reload the window) so it picks the file up, then check
**Settings → MCP** and confirm `apify` is listed and its tools are enabled.

### VS Code native agent mode

```json
{
  "servers": {
    "apify": {
      "type": "http",
      "url": "https://mcp.apify.com"
    }
  }
}
```

Then run **MCP: List Servers** from the Command Palette, select `apify`, and
start it. VS Code will show a trust prompt the first time a server starts.

### Claude Code

`.mcp.json` is picked up automatically at project scope and prompts you to
approve the server on first use.

### Claude Desktop

Claude Desktop has no project-scoped file — it reads its own user settings.
The documented, recommended path (and the only one that auto-updates) is:

1. Claude Desktop → **Settings → Connectors → Add custom connector**
2. Name: `Apify`, URL: `https://mcp.apify.com`
3. Approve the OAuth sign-in when the browser opens.

You can alternatively search "Apify" in the connector directory, or install the
one-click `.mcpb` bundle from the
[actors-mcp-server releases](https://github.com/apify/actors-mcp-server/releases).

> The widely-copied `npx mcp-remote` + `"env": { "APIFY_TOKEN": ... }` snippet
> is not the documented setup. `mcp-remote` does not read `APIFY_TOKEN` — that
> variable is read by the *local* server (`npx @apify/actors-mcp-server`).
> If you bridge to a client that cannot do remote MCP, pass the token as an
> `Authorization` header instead.

### Local stdio server (fallback / offline-clients)

If a client can only launch local processes, run the server over stdio instead:

```json
{
  "mcpServers": {
    "apify": {
      "command": "npx",
      "args": ["-y", "@apify/actors-mcp-server@latest"],
      "env": { "APIFY_TOKEN": "<your token>" }
    }
  }
}
```

This is the one setup where `APIFY_TOKEN` is real, because it is the server
process that reads it. Requires Node.js ≥ 18 (this repo pins nothing, but the
machine here runs v24).

## Authentication

**OAuth (default, recommended).** The committed config sends no credentials.
The first time the client connects, a browser opens, you sign in to Apify and
authorize the connection. Tokens are managed by the client; nothing is written
into this repo.

**Bearer token.** If you need a non-interactive setup, add an `Authorization`
header. VS Code supports secret prompts, so the token never lands in the file:

```json
{
  "inputs": [
    {
      "type": "promptString",
      "id": "apify-token",
      "description": "Apify API token",
      "password": true
    }
  ],
  "servers": {
    "apify": {
      "type": "http",
      "url": "https://mcp.apify.com",
      "headers": { "Authorization": "Bearer ${input:apify-token}" }
    }
  }
}
```

For clients without interpolation, put the value in `.env.local` (already
gitignored) and substitute it yourself, or paste it directly — but never commit
it. Create tokens in **Apify Console → Settings → API & Integrations**.

### Trimming the tool list and rate limits

- The server exposes Actor search/run, storage access, and docs search. To keep
  the tool list small and stable, pass an explicit selection:
  `https://mcp.apify.com?tools=actors,docs`
- Add the browser tools if you need page fetching:
  `https://mcp.apify.com?tools=actors,docs,apify/web-fetch`
- Rate limit: **30 requests/second per user**, across Actor runs, storage, and
  docs queries. Exceeding it returns `429` — retry with backoff.
- Two classes of Actors are deliberately *not* available through MCP:
  full-permission Actors (security) and rental Actors (subscription model).

## Audit recipes

These are Actors that **exist on the Apify Store today** and are actually
useful for this project. Full names are exact — use them verbatim.

| Actor (full name) | Use it for | Notes |
| --- | --- | --- |
| `automation-lab/website-lighthouse-seo-audit` | Lighthouse scores + Core Web Vitals per URL | Input: `startUrls`, `device` (`mobile`/`desktop`), `categories`, `includePassedAudits`, `maxItems`, `timeoutSecs`. ~$0.005/run + ~$0.014/page. |
| `constant_quadruped/website-audit-orchestrator` | One-shot site health + Lighthouse, unified report | Free to run (platform usage only). Input: `url`, `maxDepth`, `maxPages`, `lighthouseDevice`, `lighthouseCategories`, `saveHtmlReport`, `alertWebhookUrl`. |
| `onescales/website-speed-checker` | Bulk Core Web Vitals (FCP/LCP/TBT/CLS) | Input: `urls`. $0.1 per result — the options above are cheaper for a single page. |
| `perryay/website-performance-auditor` | Comparing scores between two audits | Has `mode`, `urlsA`/`urlsB` — handy for before/after hero changes. |
| `akash9078/website-screenshot-generator` | Visual diff of the hero | Input: `url`, `fullPage`. Pair with a schedule to catch regressions. |
| `fetchbase/web-screenshot-pro` | Higher-fidelity screenshots | Device presets, dark mode, cookie/ad blocking, PDF/WebP, viewport control. |
| `ocean3d/modelcheck` | **GLB/glTF game-readiness validation** | Input: `modelUrl`, `targetPreset`, `renders`. Scale sanity, pivot, triangle/texture budget, rig/animation summary. Relevant if the hero ever loads a 3D model. |
| `solidcode/awwwards-scraper` | Reference research for award-winning 3D sites | Tech stack, tags, colors, agency credits. |
| `apify/web-fetch` | Fetch one exact URL as Markdown/HTML/links | Renders JS and works around bot blocking. |
| `apify/rag-web-browser` | Google-search-then-scrape a query | Use when you have a question, not a URL. |

### Prompts that work with this setup

```
Search the Apify Store for Actors that audit website performance, then run a
desktop Lighthouse audit of https://threejs.org and summarize the results.
```

```
Run ocean3d/modelcheck on <glb-url> and tell me whether the model is
game-ready, and what its triangle and texture budgets are.
```

```
Fetch https://threejs.org with apify/web-fetch, list the assets it loads, and
compare that approach with this repo's hero in components/Hero.tsx.
```

```
Run a Lighthouse desktop audit of our deployed preview URL, then diff the
performance score against the previous run.
```

## Reality checks

These are the parts that get repeated incorrectly in blog posts and AI answers.

1. **There is no "3D WebGL speed / mobile crash auditor" on the Apify Store.**
   Searching the Store for `WebGL`, `WebGL 3D audit`, or `3D model` returns
   3D-*printing* model scrapers (Printables, Cults3D), the GLB validator listed
   above, and unrelated results. Nothing measures WebGL rendering performance.

2. **Cloud Chrome cannot tell you your frame rate.** Lighthouse on Apify runs
   headless Chrome, which typically has no GPU and falls back to SwiftShader
   software rendering. `requestAnimationFrame` timing measured there says
   nothing about real-device GPU performance. Never present those numbers as
   real-world 3D performance.

3. **No off-the-shelf Actor reports draw calls, GPU frame time, or VRAM.**
   Getting that data requires a custom Actor with injected instrumentation
   (hook `HTMLCanvasElement.prototype.getContext`, `WEBGL_debug_renderer_info`,
   `webglcontextlost` / `webglcontextrestored`, `requestAnimationFrame` deltas).
   That is a separate, larger piece of work — not a config change. If it is
   needed later, it belongs in an `actors/` subfolder as its own project, deployed
   with `apify push`, and can then accept an MCP connector as input.

4. **Actors cannot reach `http://localhost:3000`.** They run in Apify's cloud.
   To audit this app you need a deployed/preview URL, or a public tunnel to your
   local server. Also note: `npm start` does not build — run `npm run build`
   first on a fresh clone, per the root `README.md`.

5. **This hero is a `<video>`, not a canvas.** `components/Hero.tsx` renders
   `hero-bg.mp4` inside a `<video>` element. There is no Three.js, R3F, Spline,
   or WebGL code in this repo, and no `three` package is installed. Until 3D is
   actually added, a "3D audit" here is really a media/network audit.

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| Server connects but no `apify` tools appear | Enable the tools in your client's MCP settings. New servers can start disabled, or with tools denied. |
| Tools load, then vanish later | Cursor / Claude Desktop can silently revert a connector to an older version. Remove and re-add the server, then restart. |
| Auth errors, or Actor runs fail immediately | The OAuth session expired, or a bearer token is wrong. Re-authorize, or re-check **Console → Settings → API & Integrations**. |
| `429` responses | You hit the 30 requests/second per-user limit. Add retry with backoff. |
| An Actor seems to hang | Lighthouse runs take 30–180s. Check the run in Apify Console; the Actor log shows progress. |
| `spawn node ENOENT` (local stdio only) | Node installed via a version manager isn't visible to the client. Install Node system-wide, or use the remote server (no local Node needed). |
| Stale `npx` cache on Windows | `rmdir /s /q %LOCALAPPDATA%\npm-cache\_npx`, then restart the client. |
| Client can't do remote MCP at all | Use the local stdio config, or bridge with `mcp-remote` and an `Authorization` header (not `APIFY_TOKEN`). |

## Validation

This wiring was verified with a real run from this project's agent session, not
hypothetically.

**Call**

```
Actor: automation-lab/website-lighthouse-seo-audit
Input: {
  "startUrls": [{ "url": "https://threejs.org" }],
  "device": "desktop",
  "categories": ["performance", "best-practices"],
  "includePassedAudits": false,
  "maxItems": 1,
  "timeoutSecs": 180
}
```

**Result** — run `9dQSPhFFRWyK0TfpE`, dataset `16x31BCM8P4O51Sf3`, status
`SUCCEEDED`, 58.8s, cost `$0.019168`

| Metric | Value |
| --- | --- |
| Lighthouse version | 12.8.2 |
| Resolved URL | `https://threejs.org/` |
| Performance score | 78 |
| Best-practices score | 96 |
| First Contentful Paint | 887 ms |
| Largest Contentful Paint | 2123 ms |
| Total Blocking Time | 902 ms |
| Cumulative Layout Shift | 0 |
| Speed Index | 1294 ms |
| Time to Interactive | 3732 ms |
| Failing audits | 23 |

**What this run proves about the limits**

The Actor returned 66 fields: scores, Core Web Vitals, and structured audit
findings. Grepping that field list for WebGL, GPU, renderer, draw-call, or
frame-time data returns **nothing**. The `userAgent` it reported was
`HeadlessChrome/151.0.7922.34` on `Linux x86_64` — i.e. a cloud headless Chrome
with no GPU, which is exactly why its timing numbers must not be read as 3D
rendering performance. Reproduce by re-running the call above; the result lands
in your Apify account under **Runs** and exports as JSON/CSV/Excel.
