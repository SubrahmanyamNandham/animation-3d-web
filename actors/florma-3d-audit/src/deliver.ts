import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { log } from 'apify';
import type { DeliveryResult } from './types';

/**
 * Delivery through an Apify MCP connector.
 *
 * At runtime the platform injects `ACTOR_MCP_CONNECTOR_BASE_URL` and the Actor
 * reaches the upstream MCP server through the Apify MCP proxy at
 * `<base>/<connectorId>`, authenticated with the platform token. The proxy is
 * also the enforcement point: it filters `tools/list` and rejects `tools/call`
 * for anything outside the `mcpServers` declaration in `.actor/input_schema.json`,
 * so only tools this Actor declared can ever be reached.
 *
 * Outside the platform these variables do not exist; the caller should treat a
 * missing `ACTOR_MCP_CONNECTOR_BASE_URL` as a configuration error, not a crash.
 */

const PLACEHOLDER = /\{\{(\w+)\}\}/g;

/** Recursively replaces `{{token}}` occurrences in strings, arrays and objects. */
export function substitutePlaceholders<T>(value: T, tokens: Record<string, string>): T {
  if (typeof value === 'string') {
    return value.replace(PLACEHOLDER, (match, name: string) =>
      name in tokens ? tokens[name] : match,
    ) as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => substitutePlaceholders(item, tokens)) as unknown as T;
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        substitutePlaceholders(item, tokens),
      ]),
    ) as unknown as T;
  }
  return value;
}

function proxyEndpoint(connectorId: string): URL {
  const base = process.env.ACTOR_MCP_CONNECTOR_BASE_URL;
  if (!base) {
    throw new Error(
      'ACTOR_MCP_CONNECTOR_BASE_URL is not set, so no MCP connector can be reached. ' +
        'MCP connectors only exist for Actors running on the Apify platform - deploy the ' +
        'Actor (apify push) and run it there, or set the variable manually to test locally.',
    );
  }
  return new URL(`${base.replace(/\/+$/, '')}/${connectorId}`);
}

async function connect(connectorId: string): Promise<Client> {
  const transport = new StreamableHTTPClientTransport(proxyEndpoint(connectorId), {
    requestInit: {
      // The platform token authorises the proxy on this Actor's behalf.
      headers: { Authorization: `Bearer ${process.env.APIFY_TOKEN}` },
    },
  });
  const client = new Client({ name: 'florma-3d-audit', version: '0.1.0' });
  await client.connect(transport);
  return client;
}

/** Pulls the human-readable text out of a tool result, whatever shape it has. */
function extractText(result: unknown): string {
  const content = (result as { content?: unknown }).content;
  if (!Array.isArray(content)) return '';
  return content
    .filter((block) => (block as { type?: string }).type === 'text')
    .map((block) => String((block as { text?: unknown }).text ?? ''))
    .join('\n')
    .trim();
}

export interface DeliverOptions {
  connectorId: string;
  /** Empty string means "just list the tools" - a discovery mode. */
  tool: string;
  args: Record<string, unknown>;
}

export async function deliverReport(options: DeliverOptions): Promise<DeliveryResult> {
  const { connectorId, tool, args } = options;
  let client: Client | undefined;

  try {
    client = await connect(connectorId);

    if (!tool) {
      // Discovery mode: the schema promises a filtered tools/list, and writing
      // it to the run's key-value store lets the user pick a tool name without
      // guessing at upstream naming.
      const { tools } = await client.listTools();
      const names = tools.map((entry) => entry.name);
      log.info(
        `No deliveryTool set. The connector exposes ${names.length} tool(s): ${names.join(', ')}. ` +
          'Pick one and re-run with deliveryTool set to it.',
      );
      return { attempted: true, connectorId, ok: true, availableTools: names };
    }

    log.info(`Calling MCP tool "${tool}" on connector ${connectorId}.`);
    const result = (await client.callTool({ name: tool, arguments: args })) as unknown;
    const isError = Boolean((result as { isError?: boolean }).isError);
    const text = extractText(result);
    if (text) log.info(`Tool "${tool}" responded: ${text}`);

    if (isError) {
      return {
        attempted: true,
        connectorId,
        tool,
        ok: false,
        error: text || 'The upstream tool reported an error.',
      };
    }
    return { attempted: true, connectorId, tool, ok: true };
  } catch (error) {
    return {
      attempted: true,
      connectorId,
      tool,
      ok: false,
      error: (error as Error).message,
    };
  } finally {
    if (client) await client.close().catch(() => undefined);
  }
}