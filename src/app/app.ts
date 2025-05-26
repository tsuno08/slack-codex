import { App } from "@slack/bolt";
import { CodexService } from "../core/codex/manager";
import { createCompletedBlock } from "../core/slack/blocks";
import { initializeConfig } from "../infrastructure/config/env";
import { logger } from "../infrastructure/logger/logger";
import { handleAppMention } from "./handlers/appMention";
import {
  handleInputModalSubmission,
  handleOpenInputModal,
  handleSendSuggestion,
  handleStopButton,
  // outputBuffer は buttonAction.ts からインポートして共有
  outputBuffer, // この行は変更なし、確認のためコメント追加
} from "./handlers/buttonAction";

export const createApp = (): App => {
  const config = initializeConfig();

  const app = new App({
    token: config.botToken,
    appToken: config.appToken,
    signingSecret: config.signingSecret,
    socketMode: true,
  });

  // outputBuffer を app.ts からも利用するためにインポート
  const importedOutputBuffer = outputBuffer;

  app.event("app_mention", handleAppMention);
  app.action("stop_codex", handleStopButton);
  app.action("send_suggestion", handleSendSuggestion);
  app.action("open_input_modal", handleOpenInputModal);
  app.view("codex_input_modal", handleInputModalSubmission);

  const BOX_PATTERN_STRING =
    "╭──────────────────────────────────────────────────────────────────────────────╮\n│                                                                              │\n╰──────────────────────────────────────────────────────────────────────────────╯";
  const codexService = CodexService.getInstance();

  codexService.on("data", async ({ processKey, data }) => {
    try {
      const [channel, ts] = processKey.split("-");

      // outputBuffer を更新して、最新の出力を保持
      const currentOutput = importedOutputBuffer.get(processKey) || "";
      const newOutput = currentOutput + data; // data は処理済みの出力チャンク
      importedOutputBuffer.set(processKey, newOutput);

      const codexRegex =
        /codex\s([\s\S]*)╭──────────────────────────────────────────────────────────────────────────────╮/;
      const codexMatch = codexRegex.exec(data);
      console.log(data, codexMatch);
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
  });

  // Codexプロセスが終了したときの処理
  codexService.on("close", async ({ channel, ts, code }) => {
    try {
      await app.client.chat.update({
        channel: channel,
        ts: ts,
        blocks: createCompletedBlock("終了しました", code),
      });
    } catch (error) {
      logger.error("Error handling process close:", error as Error);
    }
  });

  // エラー処理
  codexService.on("error", async ({ channel, ts, error }) => {
    try {
      const processKey = codexService.createProcessKey(channel, ts);
      const currentOutput = outputBuffer.get(processKey);
      const errorOutput = `${currentOutput}\nError: ${error}`;

      await app.client.chat.update({
        channel: channel,
        ts: ts,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `\`\`\`\n${errorOutput}\n\`\`\``,
            },
          },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: "❌ エラーが発生しました",
            },
          },
        ],
      });

      importedOutputBuffer.delete(processKey);
    } catch (updateError) {
      logger.error("Error updating message with error:", updateError as Error);
    }
  });

  return app;
};
