// Codex関連の型定義
export type ProcessKey = string & { __brand: "ProcessKey" };

export type CodexConfig = {
  provider: string;
  model: string;
  approvalMode: string;
};

export type CodexClose = {
  channel: string;
  ts: string;
  code: number | null;
};

export type CodexInactivity = {
  channel: string;
  ts: string;
};
