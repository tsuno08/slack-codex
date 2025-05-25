import { EventEmitter } from "events";
import { CodexProcess } from "./process";
import {
  ProcessKey,
  CodexConfig,
  CodexOutput,
  CodexClose,
} from "../../shared/types/codex";
import { logger } from "../../infrastructure/logger";

export class CodexService extends EventEmitter {
  private static instance: CodexService;
  private processes = new Map<ProcessKey, CodexProcess>();

  private constructor() {
    super();
  }

  static getInstance = (): CodexService => {
    if (!CodexService.instance) {
      CodexService.instance = new CodexService();
    }
    return CodexService.instance;
  };

  startProcess = async (
    message: string,
    channel: string,
    ts: string
  ): Promise<ProcessKey> => {
    const processKey = this.createProcessKey(channel, ts);
    logger.info(`Starting Codex process for ${processKey}`, { message });

    // 既存プロセス停止
    await this.stopProcess(processKey);

    const config: CodexConfig = {
      provider: process.env.PROVIDER || "openai",
      model: process.env.MODEL || "",
      approvalMode: "full-auto",
    };

    const codexProcess = new CodexProcess(processKey, config);
    this.processes.set(processKey, codexProcess);

    // プロセスイベントの監視
    codexProcess.on("data", (data: string) => {
      const output: CodexOutput = { channel, ts, output: data };
      this.emit("output", output);
    });

    codexProcess.on(
      "exit",
      (exitCode: { exitCode: number; signal?: number }) => {
        const close: CodexClose = { channel, ts, code: exitCode.exitCode };
        this.processes.delete(processKey);
        this.emit("close", close);
      }
    );

    await codexProcess.start(message);
    return processKey;
  };

  stopProcess = async (processKey: ProcessKey): Promise<boolean> => {
    const codexProcess = this.processes.get(processKey);
    if (codexProcess) {
      await codexProcess.stop();
      this.processes.delete(processKey);
      return true;
    }
    logger.warn(`Process not found or already stopped [${processKey}]`);
    return false;
  };

  stopAllProcesses = async (): Promise<void> => {
    const stopPromises = Array.from(this.processes.keys()).map((key) =>
      this.stopProcess(key)
    );
    await Promise.all(stopPromises);
  };

  isProcessRunning = (processKey: ProcessKey): boolean => {
    const codexProcess = this.processes.get(processKey);
    return codexProcess?.isRunning() ?? false;
  };

  getProcessOutput = (processKey: ProcessKey): string | null => {
    const codexProcess = this.processes.get(processKey);
    return codexProcess?.getOutput() ?? null;
  };

  createProcessKey = (channel: string, ts: string): ProcessKey => {
    return `${channel}-${ts}` as ProcessKey;
  };
}
