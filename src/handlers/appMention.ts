import type { AllMiddlewareArgs, SlackEventMiddlewareArgs } from "@slack/bolt";
import {
  extractMentionText,
  extractCodexOutput,
  deleteLoadingMessage,
} from "../utils";
import { logger } from "../infrastructure/logger/logger";
import type { EventHandlers } from "../types";
import { CONSTANTS } from "../infrastructure/config/constants";
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

  await deleteLoadingMessage(client, channel, processManager, threadId);

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

  const eventHandlers: EventHandlers = {
    onData: async ({ processKey, data }) => {
      try {
        const [channel, ts] = processKey.split("-");

        const codexOutput = extractCodexOutput(data);

        if (codexOutput) {
          await deleteLoadingMessage(client, channel, processManager, ts);
          await client.chat.postMessage({
            channel: channel,
            thread_ts: ts,
            text: codexOutput,
          });
        }

        if (data.includes(CONSTANTS.BOX_PATTERN)) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          const waitingMessage = await client.chat.postMessage({
            channel: channel,
            thread_ts: ts,
            text: "Codexが入力を待っています...",
            blocks: [
              {
                type: "section",
                text: {
                  type: "mrkdwn",
                  text: "Codexが入力を待っています...",
                },
              },
              {
                type: "actions",
                elements: [
                  {
                    type: "button",
                    text: {
                      type: "plain_text",
                      text: "Codexを停止",
                    },
                    action_id: "stop_codex",
                    value: ts,
                  },
                ],
              },
            ],
          });
          if (waitingMessage.ts) {
            processManager.setLoadingMessageTs(threadId, waitingMessage.ts);
            logger.info("set waiting message", {
              channel,
              ts: waitingMessage.ts,
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
    processManager.setLoadingMessageTs(threadId, loadingMessageTs);
    logger.info("set loading message", {
      channel,
      ts: loadingMessageTs,
    });
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
