import { CodexService } from "../../core/codex/manager";
import { logger } from "../../infrastructure/logger/logger";
import type { SlackButtonActionHandler } from "../../shared/types/slack";

export const handleStopButton: SlackButtonActionHandler = async ({
  ack,
  body,
  client,
}) => {
  await ack();

  try {
    const channel = body.channel;
    const message = body.message;

    if (!channel?.id || !message?.ts) {
      logger.error("Missing channel or message data in stop button handler");
      return;
    }

    const codexService = CodexService.getInstance();
    const processKey = codexService.createProcessKey(channel.id, message.ts);

    if (codexService.stopProcess(processKey)) {
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
