import { App } from "@slack/bolt";
import { CodexService } from "../core/codex";
import { SlackBlockService } from "../core/slack";
import { truncateOutput, detectCodexInputPrompt } from "../shared/utils";
import { logger } from "../infrastructure/logger";
import { initializeConfig } from "../infrastructure/config";
import {
  handleAppMention,
  handleStopButton,
  handleSendSuggestion,
  handleOpenInputModal,
  handleInputModalSubmission,
  outputBuffer,
} from "./handlers";

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
  app.action("send_suggestion", handleSendSuggestion);
  app.action("open_input_modal", handleOpenInputModal);
  app.view("codex_input_modal", handleInputModalSubmission);

  // Codexからの出力を処理（5秒非アクティブ時にのみ発火される）
  codexService.on("output", async ({ channel, ts, output }) => {
    console.log("=== OUTPUT EVENT FIRED ===");
    console.log("Channel:", channel);
    console.log("TS:", ts);
    console.log("Output length:", output?.length || 0);
    console.log("Output preview:", output?.substring(0, 100) || "No output");
    console.log("========================");

    try {
      const processKey = codexService.createProcessKey(channel, ts);

      // バッファされた出力で既存の内容を上書き
      outputBuffer.set(processKey, output);

      const currentOutput = outputBuffer.get(processKey);
      const isRunning = codexService.isProcessRunning(processKey);
      const wasInactive = codexService.isProcessInactive(processKey);

      // 入力待ち状態を検出
      const inputPrompt = detectCodexInputPrompt(currentOutput);

      let blocks;
      if (inputPrompt.isWaitingForInput && inputPrompt.promptType) {
        // 入力待ち状態用のUI
        blocks = SlackBlockService.createInputPromptBlock(
          truncateOutput(currentOutput),
          inputPrompt.promptType,
          inputPrompt.suggestion
        );
      } else {
        // 通常の出力用のUI
        blocks = SlackBlockService.createOutputBlock(
          truncateOutput(currentOutput),
          isRunning
        );
      }

      await app.client.chat.update({
        channel: channel,
        ts: ts,
        blocks: blocks,
      });

      // 非アクティブ状態からアクティブに戻った場合のログ
      if (wasInactive) {
        logger.info("Process resumed activity", { processKey });
      }
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

  // 非アクティビティ（5秒以上出力なし）時の処理
  codexService.on("inactivity", async ({ channel, ts }) => {
    try {
      const processKey = codexService.createProcessKey(channel, ts);
      const isRunning = codexService.isProcessRunning(processKey);

      if (!isRunning) {
        return; // プロセスが停止していれば何もしない
      }

      // CodexServiceの内部バッファから現在の出力を取得
      const currentOutput = codexService.getBufferedOutput(processKey);

      // outputBufferにも同期（表示用）
      if (currentOutput) {
        outputBuffer.set(processKey, currentOutput);
      }

      // 入力待ち状態をチェック
      const inputPrompt = detectCodexInputPrompt(currentOutput);

      if (inputPrompt.isWaitingForInput) {
        return; // 入力待ち状態ならローディング表示しない
      }

      logger.info("Showing inactivity loading for process", { processKey });

      // 非アクティブ状態を含む出力ブロックを表示
      await app.client.chat.update({
        channel: channel,
        ts: ts,
        blocks: SlackBlockService.createOutputWithInactivityBlock(
          truncateOutput(currentOutput),
          true
        ),
      });
    } catch (error) {
      logger.error("Error handling inactivity:", error);
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
