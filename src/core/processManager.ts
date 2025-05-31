import type {
  EventHandlers,
  ProcessKey,
  ProcessState,
  ProcessManager as IProcessManager,
} from "../types";
import { spawn, type IPty } from "node-pty";
import { cleanCodexOutput } from "../utils";

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

    let ptyProcess: IPty | null = null;
    try {
      ptyProcess = spawn("codex", args, {
        env: {
          ...global.process.env,
        },
      });
    } catch (error) {
      console.error("[DEBUG] pspawn error:", error as Error);
      return null;
    }

    ptyProcess.onData((data: string) => {
      const processedOutput = cleanCodexOutput(data);
      handlers.onData({ processKey, data: processedOutput });
    });

    ptyProcess.onExit(({ exitCode }) => {
      try {
        handlers.onClose({ channel, ts, code: exitCode });
      } catch (_error) {
        // エラーハンドリング（未使用変数をアンダースコア付きに変更）
      } finally {
        this.processes.delete(processKey);
      }
    });

    const newProcessState: ProcessState = {
      process: ptyProcess,
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
