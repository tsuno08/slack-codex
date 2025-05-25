import dotenv from "dotenv";
import { SlackConfig } from "../../shared/types/slack";
import { LLMConfig, AppConfig } from "../../shared/types/codex";

dotenv.config();

export const getSlackConfig = (): SlackConfig => ({
  botToken: getRequiredEnv("SLACK_BOT_TOKEN"),
  appToken: getRequiredEnv("SLACK_APP_TOKEN"),
  signingSecret: getRequiredEnv("SLACK_SIGNING_SECRET"),
});

export const getLLMConfig = (): LLMConfig => ({
  apiKey: getRequiredEnv("LLM_API_KEY"),
  baseUrl: getRequiredEnv("LLM_BASE_URL"),
  model: getRequiredEnv("LLM_MODEL"),
  provider: getRequiredEnv("LLM_PROVIDER"),
});

export const getAppConfig = (): AppConfig => ({
  repository: getRequiredEnv("REPOSITORY"),
  logLevel: process.env.LOG_LEVEL || "INFO",
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
    process.env.OPENAI_API_KEY = process.env.LLM_API_KEY;
  }
  if (process.env.LLM_PROVIDER) {
    process.env[`${process.env.LLM_PROVIDER.toUpperCase()}_API_KEY`] =
      process.env.LLM_API_KEY;
    process.env[`${process.env.LLM_PROVIDER.toUpperCase()}_BASE_URL`] =
      process.env.LLM_BASE_URL;
  }

  return getSlackConfig();
};
