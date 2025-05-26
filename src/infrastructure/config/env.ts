import dotenv from "dotenv";
import type { SlackConfig } from "../../shared/types/slack";

dotenv.config();

export const getSlackConfig = (): SlackConfig => ({
  botToken: getRequiredEnv("SLACK_BOT_TOKEN"),
  appToken: getRequiredEnv("SLACK_APP_TOKEN"),
  signingSecret: getRequiredEnv("SLACK_SIGNING_SECRET"),
});

const getRequiredEnv = (key: string): string => {
  const value = process.env[key];
  if (!value) {
    throw new Error(`${key} environment variable is required`);
  }
  return value;
};

export const initializeConfig = () => {
  // OPENAI_API_KEYの設定（codexの実装上必要なため）
  if (!process.env.OPENAI_API_KEY) {
    process.env.OPENAI_API_KEY = process.env.GEMINI_API_KEY;
  }

  return getSlackConfig();
};
