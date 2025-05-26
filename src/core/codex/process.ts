import { EventEmitter } from "events";
import * as pty from "node-pty";
import { CONSTANTS } from "../../infrastructure/config/constants";
import { logger } from "../../infrastructure/logger/logger";
import type { CodexConfig, ProcessKey } from "../../shared/types/codex";
import { cleanCodexOutput, processCodexOutput } from "../../shared/utils/codex";

export class CodexProcess extends EventEmitter {
  private process: pty.IPty | null = null;
  private outputBuffer = "";
  private lastEmittedLength = 0;

  constructor(private processKey: ProcessKey, private config: CodexConfig) {
    super();
  }

  start = async (message: string): Promise<void> => {
    return new Promise((resolve) => {
      const args = [
        "--provider",
        this.config.provider,
        "--model",
        this.config.model,
        "--approval-mode",
        this.config.approvalMode,
        message,
      ];

      this.process = pty.spawn("codex", args, {
        ...CONSTANTS.PTY_CONFIG,
        env: {
          ...process.env,
          ...CONSTANTS.PTY_CONFIG.env,
        },
      });

      this.process.onData(this.handleData);
      this.process.onExit(this.handleExit);

      // プロセスが正常に開始されたことを確認
      setTimeout(() => {
        if (this.process) {
          logger.info(
            `Codex process successfully started [${this.processKey}]`
          );
          resolve();
        } else {
          logger.error(`Failed to start Codex process [${this.processKey}]`);
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

    // 入力を送信（改行を追加してEnterキーを送信）
    const inputWithNewline = input.endsWith("\n") ? input : `${input}\n`;
    this.process.write(inputWithNewline);

    // Enterキーを確実に送信するため、追加でリターンキーを送信
    // これにより対話式プロンプトでの入力が確実に処理される
    await new Promise((resolve) => setTimeout(resolve, 50)); // 少し待機
    this.process.write("\r"); // キャリッジリターン（Enter確定）

    logger.debug(`Sent input to Codex process [${this.processKey}]:`, input);
    logger.debug(`Sent enter key to Codex process [${this.processKey}]`);
  };

  private handleData = (data: string): void => {
    // 生データをバッファに追加
    this.outputBuffer += data;

    // Codex応答パターンに合わせて処理
    const processedOutput = processCodexOutput(this.outputBuffer);
    const cleanedOutput = cleanCodexOutput(processedOutput);

    logger.debug(`Codex processed output [${this.processKey}]:`, cleanedOutput);

    // 新しい出力のみを抽出してイベント発火
    if (cleanedOutput.length > this.lastEmittedLength) {
      const newOutput = cleanedOutput.slice(this.lastEmittedLength);
      this.lastEmittedLength = cleanedOutput.length;

      logger.debug(
        `Codex emitting data event [${this.processKey}]:`,
        newOutput
      );

      this.emit("data", newOutput);
    } else {
      logger.debug(
        `Codex processed output [${this.processKey}]:`,
        cleanedOutput
      );
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
