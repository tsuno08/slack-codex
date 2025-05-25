import { App } from "@slack/bolt";
import { CodexService } from "../core/codex";
import { SlackBlockService } from "../core/slack";
import { truncateOutput } from "../shared/utils";
import { logger } from "../infrastructure/logger";
import { initializeConfig } from "../infrastructure/config";
import { handleAppMention, handleStopButton, outputBuffer } from "./handlers";

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

  // イベントハンドラーの登録
  app.event("app_mention", handleAppMention);
  app.action("stop_codex", handleStopButton);

  // Codexからの出力を処理
  codexService.on("output", async ({ channel, ts, output }) => {
    try {
      const processKey = codexService.createProcessKey(channel, ts);
      outputBuffer.append(processKey, output);

      const currentOutput = outputBuffer.get(processKey);
      const isRunning = codexService.isProcessRunning(processKey);

      await app.client.chat.update({
        channel: channel,
        ts: ts,
        blocks: SlackBlockService.createOutputBlock(
          truncateOutput(currentOutput),
          isRunning
        ),
      });
    } catch (error) {
      logger.error("Error updating message with output:", error);
    }
  });

  // Codexプロセスが終了したときの処理
  codexService.on("close", async ({ channel, ts, code }) => {
    try {
      const processKey = codexService.createProcessKey(channel, ts);
      const finalOutput = outputBuffer.get(processKey);

      await app.client.chat.update({
        channel: channel,
        ts: ts,
        blocks: SlackBlockService.createCompletedBlock(finalOutput, code),
      });

      outputBuffer.delete(processKey);
    } catch (error) {
      logger.error("Error handling process close:", error);
    }
  });

  // エラー処理
  codexService.on("error", async ({ channel, ts, error }) => {
    try {
      const processKey = codexService.createProcessKey(channel, ts);
      const currentOutput = outputBuffer.get(processKey);
      const errorOutput = currentOutput + `\nError: ${error}`;

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
      logger.error("Error updating message with error:", updateError);
    }
  });

  return app;
};
