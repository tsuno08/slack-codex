import { createApp } from "./app/app";
import { CodexService } from "./core/codex/manager";
import { logger } from "./infrastructure/logger/logger";

// アプリケーションを開始
const startApp = async (): Promise<void> => {
  try {
    const app = createApp();
    await app.start();
    logger.info("⚡️ Slack Codex Bot is running!");
  } catch (error) {
    logger.error("Failed to start the app:", error);
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
