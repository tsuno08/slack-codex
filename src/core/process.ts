import { CONSTANTS } from "../infrastructure/config/constants";
import type { CodexClose, ProcessKey, ProcessState } from "../types";
import { processCodexOutput } from "../utils";
import pty from "node-pty";

// イベントハンドラ型定義
export type EventHandlers = {
  onData: (data: { processKey: ProcessKey; data: string }) => void;
  onClose: (close: CodexClose) => void;
};

// スレッドTSでプロセス検索
export const findProcessByThreadTs = (
  processes: Map<ProcessKey, ProcessState>,
  threadTs: string
): ProcessState | undefined => {
  for (const process of processes.values()) {
    if (process.threadTs === threadTs) {
      return process;
    }
  }
  return undefined;
};

// プロセスキー生成
export const createProcessKey = (channel: string, ts: string): ProcessKey => {
  return `${channel}-${ts}` as ProcessKey;
};

// プロセス開始
export const startProcess = (
  processes: Map<ProcessKey, ProcessState>,
  message: string,
  channel: string,
  ts: string,
  threadTs: string,
  handlers: EventHandlers
): [Map<ProcessKey, ProcessState>, ProcessState] => {
  const existingProcess = findProcessByThreadTs(processes, threadTs);
  if (existingProcess) {
    return [processes, existingProcess];
  }

  const processKey = createProcessKey(channel, ts);

  const newProcessState = {
    process: null,
    id: processKey,
    threadTs,
  };
  processes.set(processKey, newProcessState);

  const args = [
    "--provider",
    "gemini",
    "--model",
    "gemini-2.0-flash",
    "--approval-mode",
    "full-auto",
    message,
  ];

  const process = pty.spawn("codex", args, {
    ...CONSTANTS.PTY_CONFIG,
    env: {
      ...global.process.env, // グローバルプロセスを使用
      ...CONSTANTS.PTY_CONFIG.env,
    },
  });

  process.onData((data: string) => {
    const processedOutput = processCodexOutput(data);
    handlers.onData({ processKey, data: processedOutput });
  });

  process.onExit(({ exitCode }) => {
    handlers.onClose({ channel, ts, code: exitCode });
    processes.delete(processKey);
  });

  processes.set(processKey, newProcessState);

  return [processes, newProcessState];
};

// プロセス停止
export const stopProcess = (
  processes: Map<ProcessKey, ProcessState>,
  processKey: ProcessKey
): [Map<ProcessKey, ProcessState>, boolean] => {
  const processState = processes.get(processKey);
  if (!processState) {
    return [processes, false];
  }

  processState.process?.kill("SIGTERM");
  processes.delete(processKey);

  return [processes, true];
};
