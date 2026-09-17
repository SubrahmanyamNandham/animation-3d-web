// Temporary probe: can the dual-package MCP SDK be required from CommonJS?
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StreamableHTTPClientTransport } = require('@modelcontextprotocol/sdk/client/streamableHttp.js');
const { Actor, log } = require('apify');
const { chromium } = require('playwright');

console.log(
  'CJS-REQUIRE OK:',
  'Client=' + typeof Client,
  'Transport=' + typeof StreamableHTTPClientTransport,
  'Actor=' + typeof Actor,
  'log=' + typeof log,
  'chromium=' + typeof chromium,
);