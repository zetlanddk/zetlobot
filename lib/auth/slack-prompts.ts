import { client } from "../slack-utils";

type EphemeralTarget = {
  channel: string;
  user: string;
  threadTs?: string;
};

export async function postSignInPrompt(target: EphemeralTarget, signInUrl: string): Promise<void> {
  await client.chat.postEphemeral({
    channel: target.channel,
    user: target.user,
    ...(target.threadTs ? { thread_ts: target.threadTs } : {}),
    text: `Sign in with Google to continue: ${signInUrl}`,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "Before I can help you, please sign in with your Google account.",
        },
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: "Sign in with Google" },
            url: signInUrl,
            style: "primary",
          },
        ],
      },
    ],
  });
}
