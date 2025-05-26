import { App } from "@slack/bolt";
import { CodexService } from "../core/codex/manager";
import { createCompletedBlock } from "../core/slack/blocks";
import { initializeConfig } from "../infrastructure/config/env";
import { logger } from "../infrastructure/logger/logger";
import { handleAppMention } from "./handlers/appMention";
import { handleStopButton } from "./handlers/buttonAction";

export const createApp = (): App => {
  const config = initializeConfig();

  const app = new App({
    token: config.botToken,
    appToken: config.appToken,
    signingSecret: config.signingSecret,
    socketMode: true,
  });

  app.event("app_mention", handleAppMention);
  app.action("stop_codex", handleStopButton);

  const BOX_PATTERN_STRING =
    "╭──────────────────────────────────────────────────────────────────────────────╮\n│                                                                              │\n╰──────────────────────────────────────────────────────────────────────────────╯";
  const codexService = CodexService.getInstance();

  codexService.on("data", async ({ processKey, data }) => {
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
  });

  codexService.on("close", async ({ channel, ts, code }) => {
    try {
      await app.client.chat.postMessage({
        channel: channel,
        thread_ts: ts,
        blocks: createCompletedBlock("終了しました", code),
      });
    } catch (error) {
      logger.error("Error handling process close:", error as Error);
    }
  });

  codexService.on("error", async ({ channel, ts, error }) => {
    try {
      await app.client.chat.postMessage({
        channel: channel,
        thread_ts: ts,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `"❌ エラーが発生しました。\n\n\`\`\`\nError: ${error}\n\`\`\``,
            },
          },
        ],
      });
    } catch (updateError) {
      logger.error("Error updating message with error:", updateError as Error);
    }
  });

  return app;
};
