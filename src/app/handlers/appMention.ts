import { CodexService } from "../../core/codex/manager";
import { createLoadingBlock, createOutputBlock } from "../../core/slack/blocks";
import { extractMentionText } from "../../core/slack/utils";
import { logger } from "../../infrastructure/logger/logger";
import type { ProcessKey } from "../../shared/types/codex";
import type { SlackAppMentionHandler } from "../../shared/types/slack";
import { detectCodexInputPrompt } from "../../shared/utils/codex";
import { outputBuffer } from "./buttonAction";

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

    // 既存の実行中プロセスを確認
    const codexService = CodexService.getInstance();

    // スレッド内で最近のメッセージから実行中のプロセスを探す
    // より安全な方法として、最近の会話履歴を確認
    try {
      const conversationHistory = await client.conversations.history({
        channel: channel,
        limit: 10,
      });

      let runningProcessKey: ProcessKey | null = null;
      for (const message of conversationHistory.messages || []) {
        if (message.bot_id && message.ts) {
          const possibleProcessKey = codexService.createProcessKey(
            channel,
            message.ts
          );
          if (codexService.isProcessRunning(possibleProcessKey)) {
            const currentOutput = outputBuffer.get(possibleProcessKey);
            const inputPrompt = detectCodexInputPrompt(currentOutput);

            if (inputPrompt.isWaitingForInput) {
              runningProcessKey = possibleProcessKey;
              break;
            }
          }
        }
      }

      // 入力待ち状態のプロセスがあれば、入力として送信
      if (runningProcessKey) {
        logger.info("Sending input to running Codex process", {
          processKey: runningProcessKey,
          input: task,
        });

        await codexService.sendInput(runningProcessKey, task);

        // UIを更新して送信したことを示す
        const currentOutput = outputBuffer.get(runningProcessKey);
        const updatedOutput = `${currentOutput}\n> ${task}`;
        outputBuffer.set(runningProcessKey, updatedOutput);

        // 元のメッセージを見つけて更新
        const messageTs = runningProcessKey.replace(`${channel}-`, "");
        await client.chat.update({
          channel: channel,
          ts: messageTs,
          blocks: createOutputBlock(updatedOutput, true),
        });

        return;
      }
    } catch (error) {
      logger.warn("Failed to check for running processes", error as Error);
      // エラーが発生しても新しいプロセスとして続行
    }

    logger.info("Processing new task", { task, channel, user });

    // 初期のローディングメッセージを送信
    const response = await client.chat.postMessage({
      channel: channel,
      text: "🔄 Codexを起動しています...",
      blocks: createLoadingBlock(),
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
