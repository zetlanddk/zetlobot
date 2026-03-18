import { describe, it, expect, beforeAll } from "vitest";
import { createMCPClient } from "@ai-sdk/mcp";
import { getTenantById, getTenantSecrets, TenantId } from "../tenants";
import { MCPToolConfig } from "./index";
import { env } from "../env";

// Build mainframe tool config for testing
function buildTestMainframeConfig(tenantId: TenantId): MCPToolConfig {
  const tenant = getTenantById(tenantId);
  if (!tenant) {
    throw new Error(`Unknown tenant: ${tenantId}`);
  }
  const secrets = getTenantSecrets(tenantId);

  return {
    name: "mainframe",
    url: `${tenant.mainframeApiRoot}/api/v1/internal/mcp`,
    headers: {
      "X-Internal-Api-Key": secrets.mainframeApiKey,
      "X-Slack-Bot-Token": env.SLACK_BOT_TOKEN,
    },
  };
}

// Raw HTTP test to see what the server actually returns
async function testRawMCPRequest(url: string, body: object, headers?: Record<string, string>) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });

  return {
    status: response.status,
    statusText: response.statusText,
    headers: Object.fromEntries(response.headers.entries()),
    body: await response.text(),
  };
}

async function testRawMCPEndpoint(url: string, headers?: Record<string, string>) {
  const initializeRequest = {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "test", version: "1.0.0" },
    },
  };

  return testRawMCPRequest(url, initializeRequest, headers);
}

describe("MCP Tools", () => {
  const testTenantId: TenantId = "zetland";
  let config: MCPToolConfig;

  beforeAll(() => {
    config = buildTestMainframeConfig(testTenantId);
  });

  it("should have mainframe tool config defined", () => {
    expect(config).toBeDefined();
    expect(config.name).toBe("mainframe");
    console.log(`Mainframe MCP config: ${config.url}`);
  });

  describe("Individual MCP client initialization", () => {
    it.skip("mainframe - should initialize successfully", async () => {
      console.log(`Testing mainframe at: ${config.url}`);

      const client = await createMCPClient({
        transport: {
          type: "http",
          url: config.url,
          headers: config.headers,
        },
      });

      const tools = await client.tools();
      console.log(`mainframe tools:`, Object.keys(tools));
      expect(tools).toBeDefined();
    }, 30000);
  });

  describe("Raw HTTP diagnostics", () => {
    it.skip("mainframe - should return valid MCP response", async () => {
      console.log(`\nRaw HTTP test for mainframe at: ${config.url}`);
      const result = await testRawMCPEndpoint(config.url, config.headers);

      console.log(`Status: ${result.status} ${result.statusText}`);
      console.log(`Response headers:`, result.headers);
      console.log(`Response body:`, result.body);

      try {
        const parsed = JSON.parse(result.body);
        console.log(`Parsed JSON:`, JSON.stringify(parsed, null, 2));
      } catch (e) {
        console.log(`Body is not valid JSON`);
      }

      expect(result.status).toBe(200);
    }, 30000);

    it.skip("mainframe - test initialized notification response", async () => {
      const initializedNotification = {
        jsonrpc: "2.0",
        method: "notifications/initialized",
      };

      console.log(`\nTesting initialized notification at: ${config.url}`);
      const result = await testRawMCPRequest(config.url, initializedNotification, config.headers);

      console.log(`Status: ${result.status} ${result.statusText}`);
      console.log(`Response body: "${result.body}"`);
      console.log(`Body length: ${result.body.length}`);

      if (result.body) {
        try {
          const parsed = JSON.parse(result.body);
          console.log(`Parsed as:`, parsed, `(type: ${typeof parsed})`);
        } catch (e) {
          console.log(`Not valid JSON: ${e}`);
        }
      }
    }, 30000);
  });

  describe.skip("Tool execution", () => {
    it("mainframe - list_authors should return data", async () => {
      const client = await createMCPClient({
        transport: {
          type: "http",
          url: config.url,
          headers: config.headers,
        },
      });

      const tools = await client.tools();
      const listAuthorsTool = tools["list_authors"];
      expect(listAuthorsTool).toBeDefined();

      console.log("\nCalling list_authors tool...");
      const result = await listAuthorsTool.execute({}, {});
      console.log("list_authors result:", JSON.stringify(result, null, 2));

      expect(result).toBeDefined();
    }, 30000);

    it("mainframe - search_stories should return data", async () => {
      const client = await createMCPClient({
        transport: {
          type: "http",
          url: config.url,
          headers: config.headers,
        },
      });

      const tools = await client.tools();
      const searchTool = tools["search_stories"];
      expect(searchTool).toBeDefined();

      console.log("\nCalling search_stories tool...");
      const result = await searchTool.execute({ query: "test" }, {});
      console.log("search_stories result:", JSON.stringify(result, null, 2));

      expect(result).toBeDefined();
    }, 30000);
  });
});
