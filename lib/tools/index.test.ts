import { describe, it, expect, beforeAll } from "vitest";
import { createMCPClient } from "@ai-sdk/mcp";
import { getTenantById, getTenantSecrets, TenantId } from "../tenants";
import { MCPToolConfig } from "./index";
import { env } from "../env";

// Build tool configs for a specific tenant (mirrors the internal buildToolConfigs)
function buildTestToolConfigs(tenantId: TenantId): MCPToolConfig[] {
  const tenant = getTenantById(tenantId);
  if (!tenant) {
    throw new Error(`Unknown tenant: ${tenantId}`);
  }
  const secrets = getTenantSecrets(tenantId);

  return [
    {
      name: "mainframe",
      url: `${tenant.mainframeApiRoot}/api/v1/internal/mcp`,
      headers: { "X-Internal-Api-Key": secrets.mainframeApiKey },
    },
    {
      name: "chargebee-data-lookup",
      url: tenant.chargebeeDataLookup,
      headers: { Authorization: `Bearer ${secrets.chargebeeApiKey}` },
    },
    {
      name: "chargebee-knowledge-base",
      url: tenant.chargebeeKnowledgeBase,
    },
    {
      name: "pager-duty",
      url: "https://mcp.pagerduty.com/mcp",
      headers: { Authorization: `Token ${env.PAGER_DUTY_API_KEY}` },
    },
  ];
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
  let configs: MCPToolConfig[];

  beforeAll(() => {
    configs = buildTestToolConfigs(testTenantId);
  });

  it("should have tool configs defined", () => {
    expect(configs).toBeDefined();
    expect(configs.length).toBeGreaterThan(0);
    console.log(`Found ${configs.length} MCP tool configs:`, configs.map(c => c.name));
  });

  describe("Individual MCP client initialization", () => {
    it("mainframe - should initialize successfully", async () => {
      const config = configs.find(c => c.name === "mainframe");
      expect(config).toBeDefined();

      console.log(`Testing mainframe at: ${config!.url}`);

      const client = await createMCPClient({
        transport: {
          type: "http",
          url: config!.url,
          headers: config!.headers,
        },
      });

      const tools = await client.tools();
      console.log(`mainframe tools:`, Object.keys(tools));
      expect(tools).toBeDefined();
    }, 30000);

    it("chargebee-data-lookup - should initialize successfully", async () => {
      const config = configs.find(c => c.name === "chargebee-data-lookup");
      expect(config).toBeDefined();

      console.log(`Testing chargebee-data-lookup at: ${config!.url}`);

      const client = await createMCPClient({
        transport: {
          type: "http",
          url: config!.url,
          headers: config!.headers,
        },
      });

      const tools = await client.tools();
      console.log(`chargebee-data-lookup tools:`, Object.keys(tools));
      expect(tools).toBeDefined();
    }, 30000);

    it("chargebee-knowledge-base - should initialize successfully", async () => {
      const config = configs.find(c => c.name === "chargebee-knowledge-base");
      expect(config).toBeDefined();

      console.log(`Testing chargebee-knowledge-base at: ${config!.url}`);

      const client = await createMCPClient({
        transport: {
          type: "http",
          url: config!.url,
          headers: config!.headers,
        },
      });

      const tools = await client.tools();
      console.log(`chargebee-knowledge-base tools:`, Object.keys(tools));
      expect(tools).toBeDefined();
    }, 30000);
  });

  describe("Raw HTTP diagnostics", () => {
    it("mainframe - should return valid MCP response", async () => {
      const config = configs.find(c => c.name === "mainframe");
      expect(config).toBeDefined();

      console.log(`\nRaw HTTP test for mainframe at: ${config!.url}`);
      const result = await testRawMCPEndpoint(config!.url, config!.headers);

      console.log(`Status: ${result.status} ${result.statusText}`);
      console.log(`Response headers:`, result.headers);
      console.log(`Response body:`, result.body);

      // Parse response if possible
      try {
        const parsed = JSON.parse(result.body);
        console.log(`Parsed JSON:`, JSON.stringify(parsed, null, 2));
      } catch (e) {
        console.log(`Body is not valid JSON`);
      }

      expect(result.status).toBe(200);
    }, 30000);

    it("mainframe - test initialized notification response", async () => {
      const config = configs.find(c => c.name === "mainframe");
      expect(config).toBeDefined();

      // MCP notifications have no "id" field
      const initializedNotification = {
        jsonrpc: "2.0",
        method: "notifications/initialized",
      };

      console.log(`\nTesting initialized notification at: ${config!.url}`);
      const result = await testRawMCPRequest(config!.url, initializedNotification, config!.headers);

      console.log(`Status: ${result.status} ${result.statusText}`);
      console.log(`Response body: "${result.body}"`);
      console.log(`Body length: ${result.body.length}`);
      console.log(`Body is null string: ${result.body === "null"}`);
      console.log(`Body is empty: ${result.body === ""}`);

      // Check what the body actually contains
      if (result.body) {
        try {
          const parsed = JSON.parse(result.body);
          console.log(`Parsed as:`, parsed, `(type: ${typeof parsed})`);
        } catch (e) {
          console.log(`Not valid JSON: ${e}`);
        }
      }
    }, 30000);

    it("compare chargebee notification response", async () => {
      const config = configs.find(c => c.name === "chargebee-data-lookup");
      expect(config).toBeDefined();

      const initializedNotification = {
        jsonrpc: "2.0",
        method: "notifications/initialized",
      };

      console.log(`\nTesting initialized notification at chargebee: ${config!.url}`);
      const result = await testRawMCPRequest(config!.url, initializedNotification, config!.headers);

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

  describe("Tool execution", () => {
    it("mainframe - list_authors should return data", async () => {
      const config = configs.find(c => c.name === "mainframe");
      expect(config).toBeDefined();

      const client = await createMCPClient({
        transport: {
          type: "http",
          url: config!.url,
          headers: config!.headers,
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
      const config = configs.find(c => c.name === "mainframe");
      expect(config).toBeDefined();

      const client = await createMCPClient({
        transport: {
          type: "http",
          url: config!.url,
          headers: config!.headers,
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

  describe("All tools combined", () => {
    it("should initialize all MCP clients and get tools", async () => {
      const results: { name: string; status: "ok" | "error"; tools?: string[]; error?: string }[] = [];

      for (const config of configs) {
        try {
          console.log(`\nInitializing ${config.name}...`);

          const client = await createMCPClient({
            transport: {
              type: "http",
              url: config.url,
              headers: config.headers,
            },
          });

          const tools = await client.tools();
          const toolNames = Object.keys(tools);

          console.log(`✅ ${config.name}: ${toolNames.length} tools`);
          results.push({ name: config.name, status: "ok", tools: toolNames });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.log(`❌ ${config.name}: ${errorMessage}`);
          results.push({ name: config.name, status: "error", error: errorMessage });
        }
      }

      console.log("\n=== Summary ===");
      console.log(JSON.stringify(results, null, 2));

      // At least one should work for the test to pass
      const successCount = results.filter(r => r.status === "ok").length;
      expect(successCount).toBeGreaterThan(0);
    }, 60000);
  });
});
