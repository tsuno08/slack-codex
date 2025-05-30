import { EventEmitter } from "events";
import * as pty from "node-pty";
import { CONSTANTS } from "../../infrastructure/config/constants";
import { logger } from "../../infrastructure/logger/logger";
import type { ProcessKey, CodexProcess as CodexProcessInterface } from "../../shared/types/codex";
import { cleanCodexOutput, processCodexOutput } from "../../shared/utils/codex";

export class CodexProcess extends EventEmitter implements CodexProcessInterface {
  private process: pty.IPty | null = null;
  public id: string;
  public threadTs: string;

  constructor(processKey: ProcessKey, threadTs: string) {
    super();
    this.id = processKey;
    this.threadTs = threadTs;
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

    this.process.onData((data) => {
      const processedOutput = processCodexOutput(data);
      const cleanedOutput = cleanCodexOutput(processedOutput);
      logger.debug(
        `Codex processed output [${this.id}]:`,
        cleanedOutput
      );
      this.emit("data", cleanedOutput);
    });
    this.process.onExit(({ exitCode, signal }) => {
      logger.info(
        `Codex process exited [${this.id}] with code:`,
        exitCode
      );
      this.process = null;
      this.emit("exit", { exitCode, signal });
    });
  };

  stop = (): void => {
    if (this.process) {
      logger.info(`Stopping Codex process [${this.id}]`);
      this.process.kill("SIGTERM");
      this.process = null;
    }
  };
}
