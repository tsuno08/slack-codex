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

const handleOpenInputModal = async ({
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
    const { channel, message, actions, trigger_id } = body as any;
    const codexService = CodexService.getInstance();
    const processKey = codexService.createProcessKey(channel.id, message.ts);
    const buttonValue = JSON.parse(actions[0]?.value || "{}");

    logger.info("Open input modal button pressed", { processKey, buttonValue });

    if (codexService.isProcessRunning(processKey)) {
      // モーダルを開く
      await client.views.open({
        trigger_id: trigger_id,
        view: SlackBlockService.createInputModal(
          processKey,
          buttonValue.promptType || "general",
          buttonValue.suggestion
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
    logger.error("Error handling open input modal button:", error);
  }
};

const handleInputModalSubmission = async ({
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
    const { view } = body as any;
    const privateMetadata = JSON.parse(view.private_metadata);
    const { processKey } = privateMetadata;

    // 入力値を取得
    const inputText = view.state.values.input_block.input_text.value;

    logger.info("Input modal submitted", { processKey, inputText });

    if (!inputText?.trim()) {
      logger.warn("Empty input submitted", { processKey });
      return;
    }

    const codexService = CodexService.getInstance();

    if (codexService.isProcessRunning(processKey)) {
      // Codexプロセスに入力を送信
      await codexService.sendInput(processKey, inputText.trim());

      // UIを更新して送信したことを示す
      const currentOutput = outputBuffer.get(processKey);
      const updatedOutput = currentOutput + `\n> ${inputText.trim()}`;
      outputBuffer.set(processKey, updatedOutput);

      // プロセスキーから channel と ts を抽出
      const [channel, ts] = processKey.split("-");

      await client.chat.update({
        channel: channel,
        ts: ts,
        blocks: SlackBlockService.createOutputBlock(
          truncateOutput(updatedOutput),
          true
        ),
      });
    } else {
      logger.warn("Cannot send input: process not running", { processKey });
    }
  } catch (error) {
    logger.error("Error handling input modal submission:", error);
  }
};

export {
  outputBuffer,
  handleSendSuggestion,
  handleOpenInputModal,
  handleInputModalSubmission,
};
