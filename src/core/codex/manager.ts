import { EventEmitter } from "events";
import { logger } from "../../infrastructure/logger/logger";
import type {
  CodexClose,
  ProcessKey,
} from "../../shared/types/codex";
import { CodexProcess } from "./process";

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

  startProcess = (
    message: string,
    channel: string,
    ts: string
  ): ProcessKey => {
    const processKey = this.createProcessKey(channel, ts);
    logger.info(`Starting Codex process for ${processKey}`, { message });

    // 既存のプロセスがあれば停止
    this.stopProcess(processKey);

    const codexProcess = new CodexProcess(processKey);
    this.processes.set(processKey, codexProcess);

    // プロセスイベントの監視
    codexProcess.on("data", (data: string) => {
      this.emit("data", { processKey, data });
    });

    codexProcess.on(
      "exit",
      (exitCode: { exitCode: number; signal?: number }) => {
        const close: CodexClose = { channel, ts, code: exitCode.exitCode };
        this.processes.delete(processKey);
        this.emit("close", close);
      }
    );

    codexProcess.start(message);

    return processKey;
  };

  stopProcess = (processKey: ProcessKey): boolean => {
    const codexProcess = this.processes.get(processKey);
    if (codexProcess) {
      codexProcess.stop();
      this.processes.delete(processKey);
      return true;
    }
    logger.warn(`Process not found or already stopped [${processKey}]`);
    return false;
  };

  isProcessRunning = (processKey: ProcessKey): boolean => {
    const codexProcess = this.processes.get(processKey);
    return codexProcess?.isRunning() ?? false;
  };

  sendInput = (
    processKey: ProcessKey,
    input: string
  ): boolean => {
    const codexProcess = this.processes.get(processKey);
    if (codexProcess?.isRunning()) {
      codexProcess.sendInput(input);
      return true;
    }
    logger.warn(`Cannot send input to process [${processKey}]: not running`);
    return false;
  };

  createProcessKey = (channel: string, ts: string): ProcessKey => {
    return `${channel}-${ts}` as ProcessKey;
  };
}
