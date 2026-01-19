import { ModelMessage, generateText, stepCountIs } from "ai";
import { getToolsForTenant } from "./tools";
import { getTenantById, TenantId } from "./tenants";
import { google } from "@ai-sdk/google";

const MAX_STEPS = 10;

export const generateResponse = async (messages: ModelMessage[], tenantId: TenantId) => {
  const tenant = getTenantById(tenantId);
  if (!tenant) {
    throw new Error(`Unknown tenant: ${tenantId}`);
  }

  const tools = await getToolsForTenant(tenantId);

  const { text, steps } = await generateText({
    model: google("gemini-2.5-pro"),
    system: tenant.getSystemPrompt(),
    messages,
    tools,
    stopWhen: stepCountIs(MAX_STEPS),
    temperature: 0.3,
  });

  const hitStepLimit = steps.length >= MAX_STEPS;

  if (hitStepLimit) {
    console.warn(`Step limit reached (${steps.length} steps)`);
  }

  if (!text) {
    if (hitStepLimit) {
      return "I ran out of steps before completing. Try simplifying your request.";
    }
    return "I processed your request but have nothing to add.";
  }

  // Convert markdown to Slack mrkdwn format
  return text.replace(/\[(.*?)\]\((.*?)\)/g, "<$2|$1>").replace(/\*\*/g, "*");
};
