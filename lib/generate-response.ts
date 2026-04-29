import { ModelMessage, generateText, stepCountIs, tool } from "ai";
import { getToolsForTenant, UserContext } from "./tools";
import { getTenantById, TenantId } from "./tenants";
import { anthropic } from "@ai-sdk/anthropic";
import { getUserInfo, UserInfo } from "./slack-utils";
import { z } from "zod";

const MAX_STEPS = 10;

export type MessageContext = {
  currentUserId?: string;
  supabaseAccessToken?: string;
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

  // getUserInfo is memoized inside slack-utils, so calling it again here when
  // the handler already did is a cache hit, not a fresh API call.
  let userInfo: UserInfo | undefined;
  if (context?.currentUserId) {
    userInfo = await getUserInfo(context.currentUserId);
  }

  const userContext: UserContext | undefined = context?.supabaseAccessToken
    ? { supabaseAccessToken: context.supabaseAccessToken }
    : undefined;

  // Initial-handshake 401s propagate as MCPUnauthorizedError; handlers catch
  // them and decide whether to forceRefresh + retry or post a sign-in link.
  const handle = await getToolsForTenant(tenantId, userContext);

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const localTools: Record<string, any> = {};

    if (userInfo) {
      localTools.get_current_user = tool({
        description:
          "Get the name and email of the current user who is sending the message. " +
          "Use this when the user refers to themselves with 'me', 'I', 'my', etc. " +
          "and you need to know who they are.",
        inputSchema: z.object({}),
        execute: async () => {
          return {
            name: userInfo.displayName,
            email: userInfo.email ?? null,
          };
        },
      });
    }

    const tools = { ...handle.tools, ...localTools };

    // Claude requires the conversation to end with a user message
    while (messages.length > 0 && messages[messages.length - 1].role === "assistant") {
      messages.pop();
    }

    const { text, steps, finishReason, warnings, response } = await generateText({
      model: anthropic("claude-opus-4-7"),
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

      const toolsCalled = steps
        .flatMap((step) => step.toolCalls ?? [])
        .map((call) => call.toolName);

      const uniqueTools = [...new Set(toolsCalled)];
      const toolsContext =
        uniqueTools.length > 0 ? ` (called ${uniqueTools.join(", ")})` : "";

      if (finishReason === "error") {
        const lastStep = steps[steps.length - 1];
        console.error("Generation failed with error", {
          finishReason,
          rawFinishReason: lastStep?.rawFinishReason,
          warnings,
          modelId: response.modelId,
          stepCount: steps.length,
          lastStepText: lastStep?.text,
          lastStepContent: lastStep?.content,
          lastStepToolCalls: lastStep?.toolCalls?.map((tc) => tc.toolName),
          lastStepToolResults: lastStep?.toolResults,
          responseHeaders: response.headers,
        });
        return `Something went wrong: An error occurred while processing your request${toolsContext}. Please try again.`;
      }

      if (finishReason === "length") {
        return `Something went wrong: The response was cut off due to length limits${toolsContext}. Try simplifying your request.`;
      }

      if (finishReason === "tool-calls") {
        return `Something went wrong: I called ${uniqueTools.join(", ")} but failed to summarize the results. Please try rephrasing your request.`;
      }

      return `Something went wrong: I was unable to generate a response${toolsContext}. Please try rephrasing your request. Finish reason: ${finishReason}`;
    }

    // Convert markdown to Slack mrkdwn format
    return text.replace(/\[(.*?)\]\((.*?)\)/g, "<$2|$1>").replace(/\*\*/g, "*");
  } finally {
    await handle.close();
  }
};
