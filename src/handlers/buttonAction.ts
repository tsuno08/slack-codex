import type {
  AllMiddlewareArgs,
  BlockAction,
  ButtonAction,
  SlackActionMiddlewareArgs,
} from "@slack/bolt";
import { logger } from "../infrastructure/logger/logger";
import type { ProcessManager } from "../core/processManager";

export const handleStopButton = async ({
  ack,
  action,
  body,
  client,
  processManager,
}: SlackActionMiddlewareArgs<BlockAction<ButtonAction>> &
  AllMiddlewareArgs & {
    processManager: ProcessManager;
  }) => {
  await ack();

  try {
    const channel = body.channel;
    const message = body.message;
    const ts = action.value;

    if (!channel?.id || !message?.ts || !ts) {
      logger.error("Missing channel or message data in stop button handler");
      return;
    }

    const stopped = processManager.stopProcess(channel.id, ts);

    if (stopped) {
      await client.chat.delete({
        channel: channel.id,
        ts: message.ts,
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
