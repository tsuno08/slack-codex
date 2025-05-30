import * as pty from "node-pty";
import { CONSTANTS } from "../../infrastructure/config/constants";
import type { ProcessKey } from "../../types";
import { cleanCodexOutput, processCodexOutput } from "../../shared/utils/codex";

export type ProcessState = {
  ptyProcess: pty.IPty | null;
  id: string;
  threadTs: string;
};

export type ProcessHandlers = {
  onData: (data: string) => void;
  onExit: (exitCode: number, signal?: number) => void;
  onLog: (message: string) => void;
};

export const createProcess = (
  processKey: ProcessKey,
  threadTs: string
): ProcessState => ({
  ptyProcess: null,
  id: processKey,
  threadTs,
});

export const startProcess = (
  state: ProcessState,
  message: string,
  handlers: ProcessHandlers
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

  const ptyProcess = pty.spawn("codex", args, {
    ...CONSTANTS.PTY_CONFIG,
    env: {
      ...process.env,
      ...CONSTANTS.PTY_CONFIG.env,
    },
  });

  ptyProcess.onData((data) => {
    const processedOutput = processCodexOutput(data);
    const cleanedOutput = cleanCodexOutput(processedOutput);
    handlers.onLog(`Codex processed output [${state.id}]: ${cleanedOutput}`);
    handlers.onData(cleanedOutput);
  });

  ptyProcess.onExit(({ exitCode, signal }) => {
    handlers.onLog(`Codex process exited [${state.id}] with code: ${exitCode}`);
    handlers.onExit(exitCode, signal);
  });

  return {
    ...state,
    ptyProcess,
  };
};

export const stopProcess = (
  state: ProcessState,
  handlers: ProcessHandlers
): ProcessState => {
  if (state.ptyProcess) {
    handlers.onLog(`Stopping Codex process [${state.id}]`);
    state.ptyProcess.kill("SIGTERM");
  }
  return {
    ...state,
    ptyProcess: null,
  };
};
