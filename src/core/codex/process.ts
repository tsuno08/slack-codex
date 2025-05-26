import { EventEmitter } from "events";
import * as pty from "node-pty";
import { CONSTANTS } from "../../infrastructure/config/constants";
import { logger } from "../../infrastructure/logger/logger";
import type { ProcessKey } from "../../shared/types/codex";
import { cleanCodexOutput, processCodexOutput } from "../../shared/utils/codex";

export class CodexProcess extends EventEmitter {
  private process: pty.IPty | null = null;

  constructor(private processKey: ProcessKey) {
    super();
  }

  start = (message: string): void => {
    const args = [
      "--provider",
      "gemini",
      "--model",
      "gemini-2.0-flash",
      "--approval-mode",
      "full-auto",
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
  };

  stop = (): void => {
    if (this.process) {
      logger.info(`Stopping Codex process [${this.processKey}]`);
      this.process.kill("SIGTERM");
      this.process = null;
    }
  };

  sendInput = (input: string): void => {
    if (!this.process) {
      throw new Error(
        `Cannot send input: process not running [${this.processKey}]`
      );
    }

    // 入力を送信（改行を追加してEnterキーを送信）
    const inputWithNewline = input.endsWith("\n") ? input : `${input}\n`;
    this.process.write(inputWithNewline);

    this.process.write("\r"); // キャリッジリターン（Enter確定）

    logger.debug(`Sent input to Codex process [${this.processKey}]:`, input);
    logger.debug(`Sent enter key to Codex process [${this.processKey}]`);
  };

  private handleData = (data: string): void => {
    const processedOutput = processCodexOutput(data);
    const cleanedOutput = cleanCodexOutput(processedOutput);
    logger.debug(`Codex processed output [${this.processKey}]:`, cleanedOutput);
    this.emit("data", cleanedOutput);
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
