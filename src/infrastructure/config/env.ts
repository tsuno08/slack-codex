import dotenv from "dotenv";

dotenv.config();

const getRequiredEnv = (key: string): string => {
  const value = process.env[key];
  if (!value) {
    throw new Error(`${key} environment variable is required`);
  }
  return value;
};

export const initializeConfig = () => {
  return {
    botToken: getRequiredEnv("SLACK_BOT_TOKEN"),
    appToken: getRequiredEnv("SLACK_APP_TOKEN"),
    signingSecret: getRequiredEnv("SLACK_SIGNING_SECRET"),
  };
};
