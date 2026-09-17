// Temporary probe: do apify / playwright / the MCP SDK import cleanly as ESM?
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { Actor, log } from 'apify';
import { chromium } from 'playwright';

console.log(
  'ESM-IMPORT OK:',
  'Client=' + typeof Client,
  'Transport=' + typeof StreamableHTTPClientTransport,
  'Actor=' + typeof Actor,
  'log=' + typeof log,
  'chromium=' + typeof chromium,
);