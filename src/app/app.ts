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

  // State maps for new processing logic
  const partialLineInput = new Map<string, string>();
  const accumulatedSlackContent = new Map<string, string>();
  const isExpectingContentLine = new Map<string, boolean>();
  const shouldIgnoreProcess = new Map<string, boolean>();

  // イベントハンドラーの登録
  app.event("app_mention", handleAppMention);
  app.action("stop_codex", handleStopButton);
  app.action("send_suggestion", handleSendSuggestion);
  app.action("open_input_modal", handleOpenInputModal);
  app.view("codex_input_modal", handleInputModalSubmission);

  // Codexからのデータ出力を処理
  codexService.on("data", async ({ processKey, data }) => {
    try {
      // Raw output is still stored in outputBuffer as before
      const currentRawOutput = outputBuffer.get(processKey) || "";
      const newRawOutput = currentRawOutput + data;
      outputBuffer.set(processKey, newRawOutput);

      // New processing logic for Slack display
      let currentPartial = partialLineInput.get(processKey) || "";
      let currentDisplay = accumulatedSlackContent.get(processKey) || "";
      let expectingContent = isExpectingContentLine.get(processKey) || false;
      let ignoreOutput = shouldIgnoreProcess.get(processKey) || false;

      const incomingData = currentPartial + data;
      const lines = incomingData.split('\n');
      currentPartial = lines.pop() || ""; // Last element is new partial or empty

      for (const line of lines) {
        if (ignoreOutput) {
          continue;
        }

        const trimmedLine = line.trim();

        if (expectingContent) {
          if (trimmedLine === "╭────────────────────────") {
            ignoreOutput = true;
            shouldIgnoreProcess.set(processKey, true);
          } else {
            currentDisplay += `${line}\n`; // Add the original line with its spacing
          }
          expectingContent = false; // Consume the expectation
        } else if (trimmedLine === "codex") {
          expectingContent = true;
        }
        // Otherwise, line is ignored (not "codex" and not expected content)
      }

      partialLineInput.set(processKey, currentPartial);
      accumulatedSlackContent.set(processKey, currentDisplay);
      isExpectingContentLine.set(processKey, expectingContent);
      // shouldIgnoreProcess is set above if the marker is found

      const [channel, ts] = processKey.split("-");

      // Use the processed display content for Slack updates
      const displayContentForSlack = currentDisplay.trimEnd(); // Trim trailing newline for display
      const inputPrompt = detectCodexInputPrompt(displayContentForSlack);

      let blocks: (Block | KnownBlock)[];
      if (inputPrompt.isWaitingForInput && inputPrompt.promptType) {
        blocks = createInputPromptBlock(
          truncateOutput(displayContentForSlack),
          inputPrompt.promptType,
          inputPrompt.suggestion
        );
      } else {
        blocks = createOutputBlock(
          truncateOutput(displayContentForSlack),
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
      const finalOutputForSlack = accumulatedSlackContent.get(processKey)?.trimEnd() || "";

      await app.client.chat.update({
        channel: channel,
        ts: ts,
        blocks: createCompletedBlock(finalOutputForSlack, code),
      });

      outputBuffer.delete(processKey);
      // Clean up new state maps
      partialLineInput.delete(processKey);
      accumulatedSlackContent.delete(processKey);
      isExpectingContentLine.delete(processKey);
      shouldIgnoreProcess.delete(processKey);
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

      const currentDisplayForInactivity = accumulatedSlackContent.get(processKey)?.trimEnd() || "";
      const inputPrompt = detectCodexInputPrompt(currentDisplayForInactivity);

      if (inputPrompt.isWaitingForInput) {
        return; // 入力待ち状態ならローディング表示しない
      }

      logger.info("Showing inactivity loading for process", { processKey });

      await app.client.chat.update({
        channel: channel,
        ts: ts,
        blocks: createOutputWithInactivityBlock(
          truncateOutput(currentDisplayForInactivity),
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
