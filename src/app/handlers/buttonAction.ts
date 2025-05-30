import type {
  AllMiddlewareArgs,
  BlockAction,
  BlockElementAction,
  SlackActionMiddlewareArgs,
} from "@slack/bolt";
import { createProcessKey, stopProcess } from "../../core/codex/manager";
import { logger } from "../../infrastructure/logger/logger";

export const handleStopButton = async ({
  ack,
  body,
  client,
}: SlackActionMiddlewareArgs<BlockAction<BlockElementAction>> &
  AllMiddlewareArgs) => {
  await ack();

  try {
    const channel = body.channel;
    const message = body.message;

    if (!channel?.id || !message?.ts) {
      logger.error("Missing channel or message data in stop button handler");
      return;
    }

    // プロセスキー生成
    const processKey = createProcessKey(channel.id, message.ts);

    // ダミーのプロセスマップを渡す（実際の実装では外部から注入される）
    const dummyProcesses = new Map();
    const [_, stopped] = stopProcess(dummyProcesses, processKey);

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
