import { CodexService } from "../../core/codex";
import { SlackBlockService, SlackUtils } from "../../core/slack";
import { logger } from "../../infrastructure/logger";

export const handleAppMention = async ({
  event,
  client,
}: {
  event: any;
  client: any;
}) => {
  try {
    const { channel, text, ts, user } = event;
    logger.info("Received app mention", { channel, user, ts });

    // ボットのメンション部分を除去してタスクを取得
    const task = SlackUtils.extractMentionText(text);

    if (!task) {
      logger.warn("Empty task received", { channel, user, ts });
      await client.chat.postMessage({
        channel: channel,
        text: "❌ タスクが指定されていません。メンションの後にタスクを記述してください。\n`help` とメンションすると使用方法を表示します。",
        thread_ts: ts,
      });
      return;
    }

    logger.info("Processing task", { task, channel, user });

    // 初期のローディングメッセージを送信
    const response = await client.chat.postMessage({
      channel: channel,
      text: "🔄 Codexを起動しています...",
      blocks: SlackBlockService.createLoadingBlock(),
      thread_ts: ts,
    });

    if (!response.ts) {
      throw new Error("Failed to post initial message");
    }

    try {
      // Codexプロセスを開始
      const codexService = CodexService.getInstance();
      await codexService.startProcess(task, channel, response.ts);
    } catch (error) {
      logger.error("Failed to start Codex process", error);
      await client.chat.postMessage({
        channel: channel,
        text: "❌ Codexプロセスの起動に失敗しました。",
        thread_ts: response.ts,
      });
      return;
    }
  } catch (error) {
    logger.error("Error in app_mention handler:", error);
    await client.chat.postMessage({
      channel: event.channel,
      text: "❌ エラーが発生しました。",
      thread_ts: event.ts,
    });
  }
};
