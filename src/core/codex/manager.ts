import type { CodexClose, ProcessKey } from "../../types";
import {
  createProcess as createCodexProcess,
  startProcess as startCodexProcess,
  stopProcess as stopCodexProcess,
  type ProcessState,
  type ProcessHandlers,
} from "./process";

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
  const processState = createCodexProcess(processKey, threadTs);

  const newProcesses = new Map(processes);
  newProcesses.set(processKey, processState);

  // プロセスハンドラ設定
  const codexHandlers: ProcessHandlers = {
    onData: (data: string) => {
      handlers.onData({ processKey, data });
    },
    onExit: (exitCode: number) => {
      handlers.onClose({ channel, ts, code: exitCode });
      newProcesses.delete(processKey);
    },
    onLog: () => {}, // ログは現状無視
  };

  const updatedState = startCodexProcess(processState, message, codexHandlers);
  newProcesses.set(processKey, updatedState);

  return [newProcesses, updatedState];
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

  const updatedState = stopCodexProcess(processState, {
    onData: () => {},
    onExit: () => {},
    onLog: () => {},
  });

  const newProcesses = new Map(processes);
  if (updatedState.ptyProcess === null) {
    newProcesses.delete(processKey);
  } else {
    newProcesses.set(processKey, updatedState);
  }

  return [newProcesses, true];
};
