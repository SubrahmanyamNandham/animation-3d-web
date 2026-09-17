import { chromium, type Browser } from 'playwright';
import log from '@apify/log';

/**
 * Chromium launch arguments.
 *
 * The first two matter for correctness of the measurement itself:
 *
 * - `--enable-unsafe-swiftshader`: recent Chrome refuses to hand out a WebGL
 *   context in headless mode unless the software (SwiftShader) fallback is
 *   explicitly allowed. Without this, a 3D page reports "no WebGL" and the
 *   audit is worthless.
 * - `--ignore-gpu-blocklist`: stops the GPU blocklist silently disabling WebGL
 *   on hardware we do not control.
 *
 * `--disable-dev-shm-usage` avoids shared-memory exhaustion in containers.
 */
const CHROMIUM_ARGS = [
  '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist',
  '--disable-dev-shm-usage',
];

export interface LaunchedBrowser {
  browser: Browser;
  /** Which browser binary was used - reported in the output for traceability. */
  channel: 'chrome' | 'bundled-chromium';
}

/**
 * Launches a browser, preferring the system Google Chrome that the Apify
 * `actor-node-playwright-chrome` image installs.
 *
 * Why prefer `channel: 'chrome'`: the base image ships browser binaries that
 * track the image's own Playwright release, which can drift from the
 * `playwright` version npm resolves from package.json. A mismatch shows up at
 * runtime as "Executable doesn't exist at .../chromium-<rev>". Driving the
 * installed Chrome sidesteps that class of failure; if Chrome is missing (for
 * example in a local dev container), we fall back to bundled Chromium so the
 * Actor still works.
 */
export async function launchBrowser(proxyUrl?: string): Promise<LaunchedBrowser> {
  const proxy = proxyUrl ? { server: proxyUrl } : undefined;

  try {
    const browser = await chromium.launch({ channel: 'chrome', args: CHROMIUM_ARGS, proxy });
    log.info('Launched system Google Chrome (channel: chrome).');
    return { browser, channel: 'chrome' };
  } catch (error) {
    log.warning(
      `Could not launch system Chrome (${(error as Error).message}); ` +
        'falling back to the bundled Chromium build.',
    );
    const browser = await chromium.launch({ args: CHROMIUM_ARGS, proxy });
    return { browser, channel: 'bundled-chromium' };
  }
}
