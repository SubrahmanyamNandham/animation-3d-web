import { Actor, log } from 'apify';
import { launchBrowser } from './browser';
import { auditUrl } from './audit';
import { renderMarkdownReport } from './report';
import { deliverReport, substitutePlaceholders } from './deliver';
import type { AuditInput, AuditSettings, DeliveryResult, UrlAuditResult } from './types';

/** Used when the input omits `assetExtensions` (kept in sync with the schema). */
const DEFAULT_ASSET_EXTENSIONS = [
  '.glb',
  '.gltf',
  '.ktx2',
  '.basis',
  '.drc',
  '.bin',
  '.obj',
  '.fbx',
  '.usdz',
  '.hdr',
  '.exr',
  '.mp4',
  '.webm',
];

// `Actor.main` (rather than top-level await) keeps the compiled output
// compatible with CommonJS, which is what `module: commonjs` emits.
Actor.main(async () => {
  const input = (await Actor.getInput<AuditInput>()) ?? ({} as AuditInput);
  const urls = (input.startUrls ?? [])
    .map((entry) => entry?.url)
    .filter((url): url is string => Boolean(url));

  if (urls.length === 0) {
    await Actor.fail('No startUrls were provided, so there is nothing to audit.');
    return;
  }
  log.info(`Auditing ${urls.length} page(s).`);

  const settings: AuditSettings = {
    ...input,
    sampleSeconds: input.sampleSeconds ?? 5,
    settleMs: input.settleMs ?? 3000,
    assetExtensions: input.assetExtensions?.length ? input.assetExtensions : DEFAULT_ASSET_EXTENSIONS,
  };

  // Cast is only to satisfy the SDK's options type - the value comes straight
  // from the `proxy` editor in the input schema.
  const proxyConfiguration = await Actor.createProxyConfiguration(input.proxyConfiguration as any);
  const proxyUrl = proxyConfiguration ? ((await proxyConfiguration.newUrl()) ?? undefined) : undefined;
  if (proxyUrl) log.info('Running through a proxy.');

  const { browser, channel } = await launchBrowser(proxyUrl);
  const results: UrlAuditResult[] = [];

  try {
    for (const url of urls) {
      log.info(`Auditing ${url} ...`);
      const result = await auditUrl(browser, settings, url, channel);
      results.push(result);
      // Pushed per page so partial results survive a failure on a later page.
      await Actor.pushData(result);
      log.info(`${url} -> ${result.verdict} in ${result.runtimeMs}ms (${result.notes.length} note(s))`);
    }
  } finally {
    await browser.close().catch(() => undefined);
  }

  const generatedAt = new Date().toISOString();
  const markdown = renderMarkdownReport(results, generatedAt);
  await Actor.setValue('REPORT', markdown);
  await Actor.setValue('SUMMARY', {
    generatedAt,
    pages: results.map((result) => ({
      url: result.requestedUrl,
      status: result.status,
      verdict: result.verdict,
    })),
  });
  log.info(`\n${markdown}`);

  const delivery = await maybeDeliver(input, markdown, results, generatedAt);
  if (delivery) {
    await Actor.setValue('DELIVERY', delivery);
    if (!delivery.ok) {
      // The audit data is already in the dataset; failing the run surfaces a
      // broken delivery instead of hiding it behind a green status.
      await Actor.fail(`MCP delivery failed: ${delivery.error ?? 'unknown error'}`);
      return;
    }
    log.info(
      delivery.tool
        ? `Delivered the report through MCP tool "${delivery.tool}".`
        : 'Listed the connector tools without sending anything (discovery mode).',
    );
  }
});

/**
 * Delivers the rendered report through the connector the user picked, if any.
 * Returns `undefined` when delivery was not requested.
 */
async function maybeDeliver(
  input: AuditInput,
  markdown: string,
  results: UrlAuditResult[],
  generatedAt: string,
): Promise<DeliveryResult | undefined> {
  const connectorId = input.reportConnector;
  if (!connectorId) {
    log.info('No reportConnector set; skipping MCP delivery.');
    return undefined;
  }

  const tokens: Record<string, string> = {
    reportMarkdown: markdown,
    reportJson: JSON.stringify({ generatedAt, results }, null, 2),
    requestedUrl: results.map((result) => result.requestedUrl).join(', '),
    verdict: results.map((result) => `${result.requestedUrl}: ${result.verdict}`).join('; '),
  };

  return deliverReport({
    connectorId,
    tool: input.deliveryTool ?? '',
    args: substitutePlaceholders(
      (input.deliveryArguments ?? {}) as Record<string, unknown>,
      tokens,
    ),
  });
}