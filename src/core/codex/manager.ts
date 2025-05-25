import { EventEmitter } from "events";
import { CodexProcess } from "./process";
import {
  ProcessKey,
  CodexConfig,
  CodexOutput,
  CodexClose,
  CodexInactivity,
} from "../../shared/types/codex";
import { logger } from "../../infrastructure/logger";

type ActivityTimer = {
  timer: NodeJS.Timeout;
  lastActivity: number;
};

export class CodexService extends EventEmitter {
  private static instance: CodexService;
  private processes = new Map<ProcessKey, CodexProcess>();
  private activityTimers = new Map<ProcessKey, ActivityTimer>();
  private inactiveProcesses = new Set<ProcessKey>(); // 非アクティブ状態のプロセスを追跡
  private outputBuffer = new Map<ProcessKey, string>(); // 出力をバッファリング
  private readonly INACTIVITY_THRESHOLD = 5000; // 5秒

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
      provider: "gemini",
      model: "gemini-2.0-flash",
      approvalMode: "full-auto",
    };

    const codexProcess = new CodexProcess(processKey, config);
    this.processes.set(processKey, codexProcess);

    // プロセスイベントの監視
    codexProcess.on("data", (data: string) => {
      // 出力をバッファに蓄積（即座にUIには反映しない）
      const currentBuffer = this.outputBuffer.get(processKey) || "";
      this.outputBuffer.set(processKey, currentBuffer + data);

      this.resetActivityTimer(processKey, channel, ts);
    });

    codexProcess.on(
      "exit",
      (exitCode: { exitCode: number; signal?: number }) => {
        // プロセス終了時にバッファされた出力を発火
        const bufferedOutput = this.outputBuffer.get(processKey) || "";
        if (bufferedOutput) {
          const output: CodexOutput = { channel, ts, output: bufferedOutput };
          this.emit("output", output);
        }

        const close: CodexClose = { channel, ts, code: exitCode.exitCode };
        this.clearActivityTimer(processKey);
        this.outputBuffer.delete(processKey); // バッファをクリーンアップ
        this.processes.delete(processKey);
        this.emit("close", close);
      }
    );

    await codexProcess.start(message);

    // アクティビティタイマーを開始
    this.resetActivityTimer(processKey, channel, ts);

    return processKey;
  };

  stopProcess = async (processKey: ProcessKey): Promise<boolean> => {
    const codexProcess = this.processes.get(processKey);
    if (codexProcess) {
      this.clearActivityTimer(processKey);
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
    this.clearAllActivityTimers();
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

  private resetActivityTimer = (
    processKey: ProcessKey,
    channel: string,
    ts: string
  ): void => {
    // 既存のタイマーをクリア
    this.clearActivityTimer(processKey);

    // 非アクティブ状態をクリア
    this.inactiveProcesses.delete(processKey);

    // 新しいタイマーを設定
    const timer = setTimeout(() => {
      this.inactiveProcesses.add(processKey); // 非アクティブ状態に追加

      // バッファされた出力を発火
      const bufferedOutput = this.outputBuffer.get(processKey) || "";
      if (bufferedOutput) {
        const output: CodexOutput = { channel, ts, output: bufferedOutput };
        this.emit("output", output);
      }

      const inactivity: CodexInactivity = { channel, ts };
      this.emit("inactivity", inactivity);
    }, this.INACTIVITY_THRESHOLD);

    this.activityTimers.set(processKey, {
      timer,
      lastActivity: Date.now(),
    });
  };

  private clearActivityTimer = (processKey: ProcessKey): void => {
    const activityTimer = this.activityTimers.get(processKey);
    if (activityTimer) {
      clearTimeout(activityTimer.timer);
      this.activityTimers.delete(processKey);
    }
    // 非アクティブ状態もクリア
    this.inactiveProcesses.delete(processKey);
    // バッファもクリア
    this.outputBuffer.delete(processKey);
  };

  private clearAllActivityTimers = (): void => {
    this.activityTimers.forEach((timer) => clearTimeout(timer.timer));
    this.activityTimers.clear();
    this.inactiveProcesses.clear();
    this.outputBuffer.clear(); // 全バッファをクリア
  };

  isProcessInactive = (processKey: ProcessKey): boolean => {
    return this.inactiveProcesses.has(processKey);
  };

  getBufferedOutput = (processKey: ProcessKey): string => {
    return this.outputBuffer.get(processKey) || "";
  };
}
