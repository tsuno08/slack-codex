import { EventEmitter } from "events";
import * as pty from "node-pty";
import { ProcessKey, CodexConfig } from "../../shared/types/codex";
import { CONSTANTS } from "../../infrastructure/config";
import { logger } from "../../infrastructure/logger";
import { processCodexOutput, cleanCodexOutput } from "../../shared/utils";

export class CodexProcess extends EventEmitter {
  private process: pty.IPty | null = null;
  private outputBuffer: string = "";
  private lastEmittedLength: number = 0;

  constructor(private processKey: ProcessKey, private config: CodexConfig) {
    super();
    this.config = config;
  }

  start = async (message: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      const args = [
        "--provider",
        this.config.provider,
        "--model",
        this.config.model,
        "--approval-mode",
        this.config.approvalMode,
        message,
      ];

      logger.debug("Codex command args:", args);

      console.log("=== SPAWNING CODEX PROCESS ===");
      console.log("Command: codex");
      console.log("Args:", args);
      console.log("ProcessKey:", this.processKey);
      console.log("===============================");

      this.process = pty.spawn("codex", args, {
        ...CONSTANTS.PTY_CONFIG,
        env: {
          ...process.env,
          ...CONSTANTS.PTY_CONFIG.env,
        },
      });

      this.process.onData(this.handleData);
      this.process.onExit(this.handleExit);

      console.log("=== PROCESS HANDLERS SET ===");

      // プロセスが正常に開始されたことを確認
      setTimeout(() => {
        if (this.process) {
          logger.info(
            `Codex process successfully started [${this.processKey}]`
          );
          resolve();
        } else {
          logger.error(`Failed to start Codex process [${this.processKey}]`);
          reject(new Error("Failed to start Codex process"));
        }
      }, CONSTANTS.PROCESS_START_TIMEOUT);
    });
  };

  stop = async (): Promise<void> => {
    if (this.process) {
      logger.info(`Stopping Codex process [${this.processKey}]`);
      this.process.kill("SIGTERM");
      this.process = null;
    }
  };

  sendInput = async (input: string): Promise<void> => {
    if (!this.process) {
      throw new Error(
        `Cannot send input: process not running [${this.processKey}]`
      );
    }

    // 入力を送信（改行を追加）
    const inputWithNewline = input.endsWith("\n") ? input : input + "\n";
    this.process.write(inputWithNewline);

    logger.debug(`Sent input to Codex process [${this.processKey}]:`, input);
  };

  private handleData = (data: string): void => {
    console.log("=== CODEX PROCESS HANDLE DATA ===");
    console.log("ProcessKey:", this.processKey);
    console.log("Raw data length:", data?.length || 0);
    console.log("Raw data preview:", data?.substring(0, 100) || "No data");
    console.log("=================================");

    logger.debug(`Codex raw output [${this.processKey}]:`, data.trim());

    // 生データをバッファに追加
    this.outputBuffer += data;

    // Codex応答パターンに合わせて処理
    const processedOutput = processCodexOutput(this.outputBuffer);
    const cleanedOutput = cleanCodexOutput(processedOutput);

    console.log("=== PROCESSING OUTPUT ===");
    console.log("Output buffer length:", this.outputBuffer.length);
    console.log("Processed output length:", processedOutput.length);
    console.log("Cleaned output length:", cleanedOutput.length);
    console.log("Last emitted length:", this.lastEmittedLength);

    // 新しい出力のみを抽出してイベント発火
    if (cleanedOutput.length > this.lastEmittedLength) {
      const newOutput = cleanedOutput.slice(this.lastEmittedLength);
      this.lastEmittedLength = cleanedOutput.length;

      console.log("=== EMITTING DATA EVENT ===");
      console.log("New output length:", newOutput.length);
      console.log("New output preview:", newOutput.substring(0, 100));
      console.log("===========================");

      logger.debug(
        `Codex processed output [${this.processKey}]:`,
        newOutput.trim()
      );
      this.emit("data", newOutput);
    } else {
      console.log("=== NO NEW OUTPUT TO EMIT ===");
    }
  };

  private handleExit = (exitCode: {
    exitCode: number;
    signal?: number;
  }): void => {
    logger.info(
      `Codex process exited [${this.processKey}] with code:`,
      exitCode.exitCode
    );
    this.process = null;
    this.emit("exit", exitCode);
  };

  isRunning = (): boolean => {
    return this.process !== null;
  };
}
