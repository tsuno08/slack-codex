import { CodexService } from "../../core/codex";
import { SlackBlockService } from "../../core/slack";
import { truncateOutput, formatCodeBlock } from "../../shared/utils";
import { logger } from "../../infrastructure/logger";

// 出力を蓄積するためのマップ（シングルトンパターンで管理）
class OutputBufferManager {
  private static instance: OutputBufferManager;
  private buffer = new Map<string, string>();

  static getInstance = (): OutputBufferManager => {
    if (!OutputBufferManager.instance) {
      OutputBufferManager.instance = new OutputBufferManager();
    }
    return OutputBufferManager.instance;
  };

  set = (key: string, value: string): void => {
    this.buffer.set(key, value);
  };

  get = (key: string): string => {
    return this.buffer.get(key) || "";
  };

  append = (key: string, value: string): void => {
    const current = this.buffer.get(key) || "";
    this.buffer.set(key, current + value);
  };

  delete = (key: string): void => {
    this.buffer.delete(key);
  };
}

const outputBuffer = OutputBufferManager.getInstance();

export const handleStopButton = async ({
  ack,
  body,
  client,
}: {
  ack: any;
  body: any;
  client: any;
}) => {
  await ack();

  try {
    const { channel, message } = body as any;
    const codexService = CodexService.getInstance();
    const processKey = codexService.createProcessKey(channel.id, message.ts);

    logger.info("Stop button pressed", { processKey });

    if (await codexService.stopProcess(processKey)) {
      const currentOutput = outputBuffer.get(processKey);

      await client.chat.update({
        channel: channel.id,
        ts: message.ts,
        blocks: SlackBlockService.createStoppedBlock(currentOutput),
      });

      outputBuffer.delete(processKey);
    } else {
      await client.chat.postEphemeral({
        channel: channel.id,
        user: body.user.id,
        text: "❌ プロセスが見つからないか、既に停止しています。",
      });
    }
  } catch (error) {
    logger.error("Error handling stop button:", error);
  }
};

const handleSendSuggestion = async ({
  ack,
  body,
  client,
}: {
  ack: any;
  body: any;
  client: any;
}) => {
  await ack();

  try {
    const { channel, message, actions } = body as any;
    const codexService = CodexService.getInstance();
    const processKey = codexService.createProcessKey(channel.id, message.ts);
    const suggestion = actions[0]?.value;

    logger.info("Suggestion button pressed", { processKey, suggestion });

    if (suggestion && (await codexService.isProcessRunning(processKey))) {
      // Codexプロセスに提案を送信
      await codexService.sendInput(processKey, suggestion);

      // UIを更新して送信したことを示す
      const currentOutput = outputBuffer.get(processKey);
      const updatedOutput = currentOutput + `\n> ${suggestion}`;
      outputBuffer.set(processKey, updatedOutput);

      await client.chat.update({
        channel: channel.id,
        ts: message.ts,
        blocks: SlackBlockService.createOutputBlock(
          truncateOutput(updatedOutput),
          true
        ),
      });
    } else {
      await client.chat.postEphemeral({
        channel: channel.id,
        user: body.user.id,
        text: "❌ プロセスが見つからないか、既に停止しています。",
      });
    }
  } catch (error) {
    logger.error("Error handling suggestion button:", error);
  }
};

export { outputBuffer, handleSendSuggestion };
