import type pty from "node-pty";

export type ProcessKey = string;

export type CodexClose = {
  channel: string;
  ts: string;
  code: number | null;
};

export type Logger = {
  info: (message: string, meta?: Record<string, unknown>) => void;
  warn: (message: string, meta?: Record<string, unknown>) => void;
  error: (message: string, meta?: Record<string, unknown> | Error) => void;
};

// イベントハンドラ型定義
export type EventHandlers = {
  onData: (data: { processKey: ProcessKey; data: string }) => void;
  onClose: (close: CodexClose) => void;
};

export type ProcessState = {
  process: pty.IPty;
  processKey: string;
  threadTs: string;
  loadingMessageTs: string; // 入力待ちメッセージのタイムスタンプ
};
