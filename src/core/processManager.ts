import type { EventHandlers, ProcessKey, ProcessState } from "../types";
import { spawn, type IPty } from "node-pty";
import { cleanCodexOutput } from "../utils";

export class ProcessManager {
  private processes: Map<ProcessKey, ProcessState> = new Map();

  private createProcessKey(channel: string, ts: string): ProcessKey {
    return `${channel}-${ts}` as ProcessKey;
  }

  startProcess(
    message: string,
    channel: string,
    loadingMessageTs: string,
    threadTs: string,
    handlers: EventHandlers
  ): ProcessState | null {
    const processKey = this.createProcessKey(channel, threadTs);

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
        cwd: process.cwd(),
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
        handlers.onClose({ channel, ts: threadTs, code: exitCode });
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
      loadingMessageTs,
    };

    this.processes.set(processKey, newProcessState);
    return newProcessState;
  }

  async writeToProcess(threadTs: string, message: string) {
    const processState = this.findProcessByThreadTs(threadTs);
    if (!processState) return false;

    // メッセージの末尾に改行を追加してEnterキーを押したのと同じ効果にする
    processState.process.write(message);
    await new Promise((resolve) => setTimeout(resolve, 50)); // 少し待機
    processState.process.write("\r");
    return true;
  }

  stopProcess(channel: string, ts: string): boolean {
    const processKey = this.createProcessKey(channel, ts);
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

  setLoadingMessageTs(threadTs: string, loadingMessageTs: string): boolean {
    const process = this.findProcessByThreadTs(threadTs);
    if (!process) return false;

    this.processes.set(process.processKey, {
      ...process,
      loadingMessageTs,
    });
    return true;
  }
}
