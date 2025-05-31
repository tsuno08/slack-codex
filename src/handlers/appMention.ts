import type { AllMiddlewareArgs, SlackEventMiddlewareArgs } from "@slack/bolt";
import { extractMentionText, extractCodexOutput } from "../utils";
import { logger } from "../infrastructure/logger/logger";
import type { EventHandlers, ProcessManager } from "../types";
import { CONSTANTS } from "../infrastructure/config/constants";

// 依存性注入用のハンドラ生成関数
export const handleAppMention = async ({
  event,
  client,
  processManager,
}: SlackEventMiddlewareArgs<"app_mention"> &
  AllMiddlewareArgs & {
    processManager: ProcessManager;
  }) => {
  const { channel, text, ts, thread_ts, user } = event;
  logger.info("Received app mention", { channel, user, ts, thread_ts });
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

  if (!loadingMessage.ts) {
    logger.warn("Failed to post initial loading message", {
      channel,
      user,
      ts,
    });
    await client.chat.postMessage({
      channel: channel,
      text: "❌ ローディングメッセージの送信に失敗しました。",
      thread_ts: ts,
    });
    return;
  }

  const eventHandlers: EventHandlers = {
    onData: async ({ processKey, data }) => {
      try {
        const [channel, ts] = processKey.split("-");

        const codexOutput = extractCodexOutput(data);
        logger.info("Codex output received", { codexOutput, channel, ts });
        if (codexOutput) {
          await client.chat.postMessage({
            channel: channel,
            thread_ts: ts,
            text: codexOutput,
          });
        }

        if (data.includes(CONSTANTS.BOX_PATTERN)) {
          await client.chat.postMessage({
            channel: channel,
            thread_ts: ts,
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
    // ProcessManagerを使用してプロセスを開始
    processManager.startProcess(
      task,
      channel,
      loadingMessage.ts,
      threadId,
      eventHandlers
    );
  } catch (error) {
    logger.error("Failed to start Codex process", error as Error);
    await client.chat.postMessage({
      channel: channel,
      text: "❌ Codexプロセスの起動に失敗しました。",
      thread_ts: loadingMessage.ts,
    });
    return;
  }
};
