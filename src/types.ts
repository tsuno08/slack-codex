// Codex関連の型定義
export type ProcessKey = string & { __brand: "ProcessKey" };

export type CodexClose = {
  channel: string;
  ts: string;
  code: number | null;
};

// プロセス管理オブジェクトの型
export type ProcessManager = {
  startProcess: (
    message: string,
    channel: string,
    ts: string,
    threadTs: string
  ) => void;
};

export type Logger = {
  info: (message: string, meta?: Record<string, unknown>) => void;
  warn: (message: string, meta?: Record<string, unknown>) => void;
  error: (message: string, meta?: Record<string, unknown> | Error) => void;
};
