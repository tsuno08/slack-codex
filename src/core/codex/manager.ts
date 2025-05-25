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
  private inactiveProcesses = new Set<ProcessKey>(); // 非アクティブ状態のプロセスを追跡
  private outputBuffer = new Map<ProcessKey, string>(); // 出力をバッファリング
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

    await this.stopProcess(processKey);

    const config: CodexConfig = {
      provider: "gemini",
      model: "gemini-2.0-flash",
      approvalMode: "full-auto",
    };

    const codexProcess = new CodexProcess(processKey, config);
    this.processes.set(processKey, codexProcess);

    // プロセスイベントの監視
    codexProcess.on("data", (data: string) => {
      // 出力をバッファに蓄積
      const currentBuffer = this.outputBuffer.get(processKey) || "";
      const newBuffer = currentBuffer + data;
      this.outputBuffer.set(processKey, newBuffer);
    });

    codexProcess.on(
      "exit",
      (exitCode: { exitCode: number; signal?: number }) => {
        const bufferedOutput = this.outputBuffer.get(processKey) || "";
        if (bufferedOutput) {
          const output: CodexOutput = { channel, ts, output: bufferedOutput };
          this.emit("output", output);
        }

        const close: CodexClose = { channel, ts, code: exitCode.exitCode };
        this.outputBuffer.delete(processKey);
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

  sendInput = async (
    processKey: ProcessKey,
    input: string
  ): Promise<boolean> => {
    const codexProcess = this.processes.get(processKey);
    if (codexProcess && codexProcess.isRunning()) {
      await codexProcess.sendInput(input);
      return true;
    }
    logger.warn(`Cannot send input to process [${processKey}]: not running`);
    return false;
  };

  createProcessKey = (channel: string, ts: string): ProcessKey => {
    return `${channel}-${ts}` as ProcessKey;
  };

  isProcessInactive = (processKey: ProcessKey): boolean => {
    return this.inactiveProcesses.has(processKey);
  };

  getBufferedOutput = (processKey: ProcessKey): string => {
    return this.outputBuffer.get(processKey) || "";
  };
}
