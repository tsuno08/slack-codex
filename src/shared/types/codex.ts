// Codex関連の型定義
export type ProcessKey = string & { __brand: "ProcessKey" };

export type CodexConfig = {
  provider: string;
  model: string;
  approvalMode: string;
};

export type CodexOutput = {
  channel: string;
  ts: string;
  output: string;
};

export type CodexClose = {
  channel: string;
  ts: string;
  code: number | null;
};

export type LLMConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
  provider: string;
};

export type AppConfig = {
  repository: string;
  logLevel: string;
};
