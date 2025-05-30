import type { AllMiddlewareArgs, SlackEventMiddlewareArgs } from "@slack/bolt";
import { CodexService } from "../../core/codex/manager";
import { extractMentionText } from "../../core/slack/utils";
import { logger } from "../../infrastructure/logger/logger";

export const handleAppMention = async ({
  event,
  client,
}: SlackEventMiddlewareArgs<"app_mention"> & AllMiddlewareArgs) => {
  try {
    const { channel, text, ts, thread_ts, user } = event;
    logger.info("Received app mention", { channel, user, ts, thread_ts });

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

    logger.info("Processing task", { task, channel, user, thread_ts });

    // スレッドIDを決定 (イベントがスレッド内の場合は thread_ts を使用、そうでない場合は ts を使用)
    const threadId = thread_ts || ts;

    // 初期のローディングメッセージを送信
    const loadingMessage = await client.chat.postMessage({
      channel: channel,
      thread_ts: threadId,
      text: "処理中...",
    });

    if (!loadingMessage.ts) {
      throw new Error("Failed to post initial message");
    }

    try {
      // Codexプロセスを開始（既存プロセスがあれば再利用）
      const codexService = CodexService.getInstance();
      const codexProcess = codexService.startProcess(
        task,
        channel,
        loadingMessage.ts,
        threadId
      );

      // 既存プロセスの場合、再開メッセージを送信
      if (codexProcess.id !== `${channel}-${loadingMessage.ts}`) {
        await client.chat.postMessage({
          channel: channel,
          thread_ts: threadId,
          text: `:arrows_counterclockwise: 既存のプロセスを再開します（プロセスID: ${codexProcess.id}）`,
        });
      }
    } catch (error) {
      logger.error("Failed to start Codex process", error as Error);
      await client.chat.postMessage({
        channel: channel,
        text: "❌ Codexプロセスの起動に失敗しました。",
        thread_ts: loadingMessage.ts,
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
