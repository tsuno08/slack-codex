import { App, type ButtonAction, type BlockAction } from "@slack/bolt";
import { initializeConfig } from "./infrastructure/config/env";
import { logger } from "./infrastructure/logger/logger";
import { handleAppMention } from "./handlers/appMention";
import { handleStopButton } from "./handlers/buttonAction";
import { ProcessManager } from "./core/processManager";

// アプリケーションを開始
const startApp = async (): Promise<void> => {
  try {
    const config = initializeConfig();

    const app = new App({
      token: config.botToken,
      appToken: config.appToken,
      signingSecret: config.signingSecret,
      socketMode: true,
    });
    const processManager = new ProcessManager();

    app.event("app_mention", (args) =>
      handleAppMention({ ...args, processManager })
    );
    app.action<BlockAction<ButtonAction>>("stop_codex", (args) =>
      handleStopButton({ ...args, processManager })
    );

    await app.start();
    logger.info("⚡️ Slack Codex Bot is running!");
  } catch (error) {
    logger.error("Failed to start the app:", error as Error);
    process.exit(1);
  }
};

// 終了時のクリーンアップ
const cleanup = async (): Promise<void> => {
  logger.info("⏹️ Shutting down...");
  // Codexプロセスは個別に管理されるため、プロセス終了時に自動的にクリーンアップされる
  process.exit(0);
};

process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);

startApp();
