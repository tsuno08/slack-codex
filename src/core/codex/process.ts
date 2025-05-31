import { CONSTANTS } from "../../infrastructure/config/constants";
import type { ProcessKey } from "../../types";
import { processCodexOutput } from "../../utils";

interface ProcessInstance {
  onData: (callback: (data: string) => void) => void;
  onExit: (callback: (code: number, signal?: number) => void) => void;
  kill: (signal: string) => void;
}

// プロセス制御インターフェース
export interface ProcessController {
  spawn(command: string, args: string[], config: object): ProcessInstance;
}

// node-ptyベースのデフォルト実装
export const NodePtyController: ProcessController = {
  spawn(command: string, args: string[], config: object) {
    const pty = require("node-pty");
    const ptyProcess = pty.spawn(command, args, config);

    return {
      onData: (callback) => ptyProcess.onData(callback),
      onExit: (callback) =>
        ptyProcess.onExit((e: { exitCode: number; signal?: number }) =>
          callback(e.exitCode, e.signal)
        ),
      kill: (signal) => ptyProcess.kill(signal),
    };
  },
};

export type ProcessState = {
  process: ProcessInstance | null;
  id: string;
  threadTs: string;
};

export type ProcessHandlers = {
  onData: (data: string) => void;
  onExit: (exitCode: number, signal?: number) => void;
};

export const createProcess = (
  processKey: ProcessKey,
  threadTs: string
): ProcessState => ({
  process: null,
  id: processKey,
  threadTs,
});

export const startProcess = (
  state: ProcessState,
  message: string,
  handlers: ProcessHandlers,
  controller: ProcessController = NodePtyController // 依存性注入
): ProcessState => {
  const args = [
    "--provider",
    "gemini",
    "--model",
    "gemini-2.0-flash",
    "--approval-mode",
    "full-auto",
    message,
  ];

  const processInstance = controller.spawn("codex", args, {
    ...CONSTANTS.PTY_CONFIG,
    env: {
      ...global.process.env, // グローバルプロセスを使用
      ...CONSTANTS.PTY_CONFIG.env,
    },
  });

  processInstance.onData((data: string) => {
    const processedOutput = processCodexOutput(data);
    handlers.onData(processedOutput);
  });

  processInstance.onExit((exitCode: number, signal?: number) => {
    handlers.onExit(exitCode, signal);
  });

  return {
    ...state,
    process: processInstance,
  };
};

export const stopProcess = (
  state: ProcessState,
): ProcessState => {
  if (state.process) {
    state.process.kill("SIGTERM");
  }
  return {
    ...state,
    process: null,
  };
};
