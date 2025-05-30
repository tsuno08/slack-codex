import { App } from "@slack/bolt";
import {
  startProcess,
  stopProcess,
  type EventHandlers,
} from "../core/codex/manager";
import type { ProcessKey } from "../types";
import { initializeConfig } from "../infrastructure/config/env";
import { logger } from "../infrastructure/logger/logger";
import { createAppMentionHandler } from "./handlers/appMention";
import { handleStopButton } from "./handlers/buttonAction";

export const createApp = () => {
  const config = initializeConfig();
  let processes = new Map();

  const app = new App({
    token: config.botToken,
    appToken: config.appToken,
    signingSecret: config.signingSecret,
    socketMode: true,
  });

  const BOX_PATTERN_STRING =
    "╭──────────────────────────────────────────────────────────────────────────────╮\n│                                                                              │\n╰──────────────────────────────────────────────────────────────────────────────╯";

  // イベントハンドラの定義 (副作用関数)
  const eventHandlers: EventHandlers = {
    onData: async ({ processKey, data }) => {
      console.log(`data: ${data}`);
      try {
        const [channel, ts] = processKey.split("-");

        const codexRegex =
          /codex\s([\s\S]*)╭──────────────────────────────────────────────────────────────────────────────╮/;
        const codexMatch = codexRegex.exec(data);
        if (codexMatch?.[1]) {
          await app.client.chat.postMessage({
            channel: channel,
            thread_ts: ts,
            text: codexMatch[1],
          });
        }

        if (data.includes(BOX_PATTERN_STRING)) {
          await app.client.chat.postMessage({
            channel: channel,
            thread_ts: ts,
            text: "Codexが入力を待っています...",
          });
        }
      } catch (error) {
        logger.error("Error updating message with data:", error as Error);
      }
    },
    onClose: async ({ channel, ts }) => {
      try {
        await app.client.chat.postMessage({
          channel: channel,
          thread_ts: ts,
          text: "終了しました",
        });
      } catch (error) {
        logger.error("Error handling process close:", error as Error);
      }
    },
  };

  // 初期化処理 (純粋関数)
  const initializeProcessHandling = () => {
    return {
      startProcess: (
        message: string,
        channel: string,
        ts: string,
        threadTs: string
      ) => {
        const [newProcesses] = startProcess(
          processes,
          message,
          channel,
          ts,
          threadTs,
          eventHandlers
        );
        processes = newProcesses; // 状態を新しいマップで更新
      },
      stopProcess: (key: ProcessKey) => {
        const [newProcesses, stopped] = stopProcess(processes, key);
        if (stopped) {
          processes = newProcesses;
        }
      },
    };
  };

  const processHandlers = initializeProcessHandling();

  // 依存性注入でハンドラを作成
  const appMentionHandler = createAppMentionHandler({
    logger,
    processManager: {
      startProcess: processHandlers.startProcess
    }
  });

  app.event("app_mention", appMentionHandler);
  app.action("stop_codex", handleStopButton);

  return app;
};
