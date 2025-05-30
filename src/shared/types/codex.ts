// Codex関連の型定義
export type ProcessKey = string & { __brand: "ProcessKey" };

export interface CodexProcess {
  id: string;
  threadTs: string;
  // 既存のプロパティ...
}

export type CodexClose = {
  channel: string;
  ts: string;
  code: number | null;
};
