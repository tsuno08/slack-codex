import type {
  AllMiddlewareArgs,
  SlackAction,
  SlackActionMiddlewareArgs,
} from "@slack/bolt";
import { logger } from "../infrastructure/logger/logger";
import type { ProcessManager } from "../types";

export const handleStopButton = async ({
  ack,
  body,
  client,
  processManager,
}: SlackActionMiddlewareArgs<SlackAction> &
  AllMiddlewareArgs & {
    processManager: ProcessManager;
  }) => {
  await ack();

  if (!("message" in body)) {
    logger.error("Invalid action body: missing message data");
    return;
  }

  try {
    const channel = body.channel;
    const message = body.message;

    if (!channel?.id || !message?.ts) {
      logger.error("Missing channel or message data in stop button handler");
      return;
    }

    const stopped = processManager.stopProcess(channel.id, message.ts);

    if (stopped) {
      await client.chat.update({
        channel: channel.id,
        ts: message.ts,
        text: "Codexプロセスを停止しました。",
      });
    } else {
      await client.chat.postEphemeral({
        channel: channel.id,
        user: body.user.id,
        text: "❌ プロセスが見つからないか、既に停止しています。",
      });
    }
  } catch (error) {
    logger.error("Error handling stop button:", error as Error);
  }
};
