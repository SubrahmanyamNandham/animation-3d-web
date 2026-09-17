/**
 * Guards a silent and dangerous failure mode.
 *
 * Playwright serialises the page-side instrumentation with
 * Function.prototype.toString() and evaluates it inside the page. If that
 * source references anything from module scope - most insidiously `exports`,
 * which TypeScript's CommonJS emit introduces whenever a function refers to an
 * exported const - the injected script throws immediately and *every* metric
 * silently reports zero. A "no WebGL detected" verdict then looks like a real
 * finding instead of a broken audit.
 *
 * This ran for real: `w[AUDIT_GLOBAL]` compiled to `w[exports.AUDIT_GLOBAL]`,
 * the page threw "exports is not defined", and both audited pages came back
 * with zero canvases and zero contexts. Run this after every build.
 */
import vm from 'node:vm';
import assert from 'node:assert';
import telemetry from '../dist/telemetry.js';

const source = telemetry.installPageInstrumentation.toString();

// 1. The serialised source must not reach for module scope.
//    Note: Function.toString() keeps comments, so a comment inside the function
//    that spells out a forbidden token trips this check too. Keep such notes
//    outside the function body.
for (const forbidden of ['exports.', 'require(', '__dirname', '__filename']) {
  if (source.includes(forbidden)) {
    console.error(`FAIL: the serialised instrumentation references "${forbidden}".`);
    console.error('It must be self-contained - declare every value inside the function body.');
    process.exit(1);
  }
}

// 2. Evaluating it in a bare, page-like context must install the API.
const sandbox = {
  document: { title: 'stub', querySelectorAll: () => [] },
  performance: { now: () => 0, getEntriesByType: () => [] },
  navigator: { userAgent: 'stub' },
  location: { href: 'https://example.com/' },
  requestAnimationFrame: () => 1,
  setTimeout: () => 1,
  clearTimeout: () => {},
  HTMLCanvasElement: class {
    getContext() {
      return null;
    }
  },
  console,
};
sandbox.window = {
  addEventListener: () => {},
  innerWidth: 1440,
  innerHeight: 900,
  devicePixelRatio: 1,
  top: null,
};
sandbox.window.top = sandbox.window;

const context = vm.createContext(sandbox);
vm.runInContext(`(${source})()`, context, { filename: 'page-instrumentation.js' });

const api = sandbox.window[telemetry.AUDIT_GLOBAL];
assert.ok(api, `Expected window["${telemetry.AUDIT_GLOBAL}"] to be installed in the page.`);
assert.strictEqual(typeof api.sampleFrames, 'function', 'sampleFrames must be exposed.');
assert.strictEqual(typeof api.snapshot, 'function', 'snapshot must be exposed.');

// 3. The snapshot has to survive the Playwright boundary as plain JSON.
//    (Compared as a string because vm objects live in another realm, where
//    deepStrictEqual would fail on prototype identity alone.)
const serialised = JSON.stringify(api.snapshot(['.glb']));
assert.ok(serialised.includes('"webgl"'), 'snapshot must contain the webgl section.');
assert.ok(serialised.includes('"frames"'), 'snapshot must contain the frames section.');
assert.strictEqual(JSON.parse(serialised).webgl.present, false, 'the stub page has no WebGL.');

console.log(
  'Page instrumentation verified: self-contained, installs its API, and returns JSON-serialisable telemetry.',
);