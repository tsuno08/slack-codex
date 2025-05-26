import { App } from "@slack/bolt";
import type { Block, KnownBlock } from "@slack/types";
import { CodexService } from "../core/codex/manager";
import {
  createCompletedBlock,
  createInputPromptBlock,
  createOutputBlock,
  createOutputWithInactivityBlock,
} from "../core/slack/blocks";
import { initializeConfig } from "../infrastructure/config/env";
import { logger } from "../infrastructure/logger/logger";
import { detectCodexInputPrompt } from "../shared/utils/codex";
import { truncateOutput } from "../shared/utils/string";
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

  // イベントハンドラーの登録
  app.event("app_mention", handleAppMention);
  app.action("stop_codex", handleStopButton);
  app.action("send_suggestion", handleSendSuggestion);
  app.action("open_input_modal", handleOpenInputModal);
  app.view("codex_input_modal", handleInputModalSubmission);

  // Codexからのデータ出力を処理
  codexService.on("data", async ({ processKey, data }) => {
    try {
      // outputBufferに出力を蓄積
      const currentOutput = outputBuffer.get(processKey) || "";
      const newOutput = currentOutput + data;
      outputBuffer.set(processKey, newOutput);

      // プロセスキーからchannel, tsを取得
      const [channel, ts] = processKey.split("-");

      // 入力待ち状態を検出
      const inputPrompt = detectCodexInputPrompt(newOutput);

      let blocks: (Block | KnownBlock)[];
      if (inputPrompt.isWaitingForInput && inputPrompt.promptType) {
        // 入力待ち状態用のUI
        blocks = createInputPromptBlock(
          truncateOutput(newOutput),
          inputPrompt.promptType,
          inputPrompt.suggestion
        );
      } else {
        // 通常の出力用のUI
        blocks = createOutputBlock(
          truncateOutput(newOutput),
          codexService.isProcessRunning(processKey)
        );
      }

      await app.client.chat.update({
        channel: channel,
        ts: ts,
        blocks: blocks,
      });
    } catch (error) {
      logger.error("Error updating message with data:", error as Error);
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
        blocks: createCompletedBlock(finalOutput, code),
      });

      outputBuffer.delete(processKey);
    } catch (error) {
      logger.error("Error handling process close:", error as Error);
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

      // 外部のoutputBufferから現在の出力を取得
      const currentOutput = outputBuffer.get(processKey);

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
        blocks: createOutputWithInactivityBlock(
          truncateOutput(currentOutput),
          true
        ),
      });
    } catch (error) {
      logger.error("Error handling inactivity:", error as Error);
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
