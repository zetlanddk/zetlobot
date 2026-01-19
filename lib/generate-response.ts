import { ModelMessage, generateText, stepCountIs, tool } from "ai";
import { getToolsForTenant } from "./tools";
import { getTenantById, TenantId } from "./tenants";
import { google } from "@ai-sdk/google";
import { getUserInfo } from "./slack-utils";
import { z } from "zod";

const MAX_STEPS = 10;

export type MessageContext = {
  currentUserId?: string;
};

export const generateResponse = async (
  messages: ModelMessage[],
  tenantId: TenantId,
  context?: MessageContext,
) => {
  const tenant = getTenantById(tenantId);
  if (!tenant) {
    throw new Error(`Unknown tenant: ${tenantId}`);
  }

  const mcpTools = await getToolsForTenant(tenantId);

  // Build local tools based on context
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const localTools: Record<string, any> = {};

  if (context?.currentUserId) {
    localTools.get_current_user = tool({
      description:
        "Get the name and email of the current user who is sending the message. " +
        "Use this when the user refers to themselves with 'me', 'I', 'my', etc. " +
        "and you need to know who they are.",
      inputSchema: z.object({}),
      execute: async () => {
        const userInfo = await getUserInfo(context.currentUserId!);
        return {
          name: userInfo.displayName,
          email: userInfo.email ?? null,
        };
      },
    });
  }

  const tools = { ...mcpTools, ...localTools };

  const { text, steps } = await generateText({
    model: google("gemini-3-pro-preview"),
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
