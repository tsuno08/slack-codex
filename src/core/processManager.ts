import type {
  EventHandlers,
  ProcessKey,
  ProcessState,
  ProcessManager as IProcessManager,
} from "../types";
import pty from "node-pty";
import { CONSTANTS } from "../infrastructure/config/constants";
import { processCodexOutput } from "../utils";

export class ProcessManager implements IProcessManager {
  private processes: Map<ProcessKey, ProcessState> = new Map();

  private createProcessKey(channel: string, ts: string): ProcessKey {
    return `${channel}-${ts}` as ProcessKey;
  }

  startProcess(
    message: string,
    channel: string,
    ts: string,
    threadTs: string,
    handlers: EventHandlers
  ): ProcessState | null {
    const processKey = this.createProcessKey(channel, ts);

    // 既存プロセスをスレッドIDでチェック
    if (this.findProcessByThreadTs(threadTs)) {
      return null;
    }

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
        ...global.process.env,
        ...CONSTANTS.PTY_CONFIG.env,
      },
    });

    process.onData((data: string) => {
      const processedOutput = processCodexOutput(data);
      handlers.onData({ processKey, data: processedOutput });
    });

    process.onExit(({ exitCode }) => {
      try {
        handlers.onClose({ channel, ts, code: exitCode });
      } catch (_error) {
        // エラーハンドリング（未使用変数をアンダースコア付きに変更）
      } finally {
        this.processes.delete(processKey);
      }
    });

    const newProcessState: ProcessState = {
      process,
      processKey,
      threadTs,
    };

    this.processes.set(processKey, newProcessState);
    return newProcessState;
  }

  stopProcess(processKey: ProcessKey): boolean {
    const processState = this.processes.get(processKey);
    if (!processState) return false;

    processState.process?.kill("SIGTERM");
    this.processes.delete(processKey);
    return true;
  }

  findProcessByThreadTs(threadTs: string): ProcessState | undefined {
    for (const process of this.processes.values()) {
      if (process.threadTs === threadTs) {
        return process;
      }
    }
    return undefined;
  }
}
