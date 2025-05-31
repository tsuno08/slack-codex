import type { AllMiddlewareArgs, SlackEventMiddlewareArgs } from "@slack/bolt";
import { extractMentionText, extractCodexOutput } from "../utils";
import { logger } from "../infrastructure/logger/logger";
import type { EventHandlers } from "../types";
import type { ProcessManager } from "../core/processManager";

export const handleAppMention = async ({
  event,
  client,
  processManager,
}: SlackEventMiddlewareArgs<"app_mention"> &
  AllMiddlewareArgs & {
    processManager: ProcessManager;
  }) => {
  const { channel, text, ts, thread_ts, user } = event;
  const prompt = extractMentionText(text);

  if (!prompt) {
    logger.warn("Empty prompt received", { channel, user, ts });
    await client.chat.postMessage({
      channel: channel,
      text: "❌ プロンプトが指定されていません。メンションの後にプロンプトを記述してください。\n`help` とメンションすると使用方法を表示します。",
      thread_ts: ts,
    });
    return;
  }

  // スレッドIDを決定 (イベントがスレッド内の場合は thread_ts を使用、そうでない場合は ts を使用)
  const threadId = thread_ts || ts;

  const loadingMessage = await client.chat.postMessage({
    channel: channel,
    thread_ts: threadId,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "Codexが処理を開始しました",
        },
      },
    ],
  });

  const loadingMessageTs = loadingMessage.ts;
  if (!loadingMessageTs) {
    logger.warn("Failed to post initial loading message", {
      channel,
      user,
      ts,
    });
    await client.chat.postMessage({
      channel: channel,
      text: "❌ ローディングメッセージの送信に失敗しました。",
      thread_ts: threadId,
    });
    return;
  }
  processManager.setLoadingMessageTs(threadId, loadingMessageTs);

  const eventHandlers: EventHandlers = {
    onData: async ({ processKey, data }) => {
      try {
        const [channel, ts] = processKey.split("-");

        const codexOutput = extractCodexOutput(data);

        if (codexOutput) {
          const existingProcess = processManager.findProcessByThreadTs(ts);
          if (existingProcess?.loadingMessageTs) {
            await client.chat.update({
              channel: channel,
              ts: existingProcess.loadingMessageTs,
              text: codexOutput,
            });
          } else {
            await client.chat.postMessage({
              channel: channel,
              thread_ts: ts,
              text: codexOutput,
            });
          }
        }
      } catch (error) {
        logger.error("Error updating message with data:", error as Error);
      }
    },
    onClose: async ({ channel, ts }) => {
      try {
        await client.chat.postMessage({
          channel: channel,
          thread_ts: ts,
          text: "終了しました",
        });
      } catch (error) {
        logger.error("Error handling process close:", error as Error);
      }
    },
  };

  try {
    const existingProcess = processManager.findProcessByThreadTs(threadId);
    if (existingProcess) {
      await processManager.writeToProcess(threadId, prompt);
    } else {
      processManager.startProcess(
        prompt,
        channel,
        loadingMessageTs,
        threadId,
        eventHandlers
      );
    }
  } catch (error) {
    logger.error("Failed to start Codex process", error as Error);
    await client.chat.postMessage({
      channel: channel,
      text: "❌ Codexプロセスの起動に失敗しました。",
      thread_ts: loadingMessageTs,
    });
    return;
  }
};
