import { App } from "@slack/bolt";
import { CodexService } from "../core/codex/manager";
import {
  createCompletedBlock,
  createInputPromptBlock,
} from "../core/slack/blocks";
import { initializeConfig } from "../infrastructure/config/env";
import { logger } from "../infrastructure/logger/logger";
import { handleAppMention } from "./handlers/appMention";
import {
  handleInputModalSubmission,
  handleOpenInputModal,
  handleSendSuggestion,
  handleStopButton,
  outputBuffer,
} from "./handlers/buttonAction";

export const createApp = (): App => {
  const config = initializeConfig();

  // Slack Bolt アプリを初期化
  const app = new App({
    token: config.botToken,
    appToken: config.appToken,
    signingSecret: config.signingSecret,
    socketMode: true,
  });

  // Codex サービスを初期化
  const codexService = CodexService.getInstance();

  const accumulatedSlackContent = new Map<string, string>();

  const BOX_PATTERN_STRING =
    "╭──────────────────────────────────────────────────────────────────────────────╮\n│                                                                              │\n╰──────────────────────────────────────────────────────────────────────────────╯";

  // イベントハンドラーの登録
  app.event("app_mention", handleAppMention);
  app.action("stop_codex", handleStopButton);
  app.action("send_suggestion", handleSendSuggestion);
  app.action("open_input_modal", handleOpenInputModal);
  app.view("codex_input_modal", handleInputModalSubmission);

  // Codexからのデータ出力を処理
  codexService.on("data", async ({ processKey, data }) => {
    try {
      const [channel, ts] = processKey.split("-");

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
          blocks: createInputPromptBlock(),
        });
      }
    } catch (error) {
      logger.error("Error updating message with data:", error as Error);
    }
  });

  // Codexプロセスが終了したときの処理
  codexService.on("close", async ({ channel, ts, code }) => {
    try {
      const processKey = codexService.createProcessKey(channel, ts);
      const finalOutputForSlack =
        accumulatedSlackContent.get(processKey)?.trimEnd() || "";

      await app.client.chat.update({
        channel: channel,
        ts: ts,
        blocks: createCompletedBlock(finalOutputForSlack, code),
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

      outputBuffer.delete(processKey);
    } catch (updateError) {
      logger.error("Error updating message with error:", updateError as Error);
    }
  });

  return app;
};
