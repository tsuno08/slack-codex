import { EventEmitter } from "events";
import * as pty from "node-pty";
import { ProcessKey, CodexConfig } from "../../shared/types/codex";
import { CONSTANTS } from "../../infrastructure/config";
import { logger } from "../../infrastructure/logger";

export class CodexProcess extends EventEmitter {
  private process: pty.IPty | null = null;
  private outputBuffer: string = "";

  constructor(private processKey: ProcessKey, private config: CodexConfig) {
    super();
  }

  start = async (message: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        reject(new Error("OPENAI_API_KEY is not set"));
        return;
      }

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

  private handleData = (data: string): void => {
    logger.debug(`Codex output [${this.processKey}]:`, data.trim());
    this.outputBuffer += data;
    this.emit("data", data);
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

  getOutput = (): string => {
    return this.outputBuffer;
  };

  isRunning = (): boolean => {
    return this.process !== null;
  };
}
