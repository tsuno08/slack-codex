import { CodexService } from "../../core/codex/manager";
import { createLoadingBlock } from "../../core/slack/blocks";
import { extractMentionText } from "../../core/slack/utils";
import { logger } from "../../infrastructure/logger/logger";
import type { SlackAppMentionHandler } from "../../shared/types/slack";

export const handleAppMention: SlackAppMentionHandler = async ({
  event,
  client,
}) => {
  try {
    const { channel, text, ts, user } = event;
    logger.info("Received app mention", { channel, user, ts });

    // ボットのメンション部分を除去してタスクを取得
    const task = extractMentionText(text);

    if (!task) {
      logger.warn("Empty task received", { channel, user, ts });
      await client.chat.postMessage({
        channel: channel,
        text: "❌ タスクが指定されていません。メンションの後にタスクを記述してください。\n`help` とメンションすると使用方法を表示します。",
        thread_ts: ts,
      });
      return;
    }

    logger.info("Processing new task", { task, channel, user });

    // 初期のローディングメッセージを送信
    const response = await client.chat.postMessage({
      channel: channel,
      text: "処理中...",
      blocks: createLoadingBlock(),
      thread_ts: ts,
    });

    if (!response.ts) {
      throw new Error("Failed to post initial message");
    }

    try {
      // Codexプロセスを開始
      const codexService = CodexService.getInstance();
      codexService.startProcess(task, channel, response.ts);
    } catch (error) {
      logger.error("Failed to start Codex process", error as Error);
      await client.chat.postMessage({
        channel: channel,
        text: "❌ Codexプロセスの起動に失敗しました。",
        thread_ts: response.ts,
      });
      return;
    }
  } catch (error) {
    logger.error("Error in app_mention handler:", error as Error);
    await client.chat.postMessage({
      channel: event.channel,
      text: "❌ エラーが発生しました。",
      thread_ts: event.ts,
    });
  }
};
