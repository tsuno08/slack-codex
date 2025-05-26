import { CodexService } from "../../core/codex/manager";
import {
  createInputModal,
  createOutputBlock,
  createStoppedBlock,
} from "../../core/slack/blocks";
import { logger } from "../../infrastructure/logger/logger";
import type {
  SlackButtonActionHandler,
  SlackViewSubmissionHandler,
} from "../../shared/types/slack";
import { truncateOutput } from "../../shared/utils/string";

// ボタンの値を取得するためのタイプガード
type ButtonActionWithValue = {
  value?: string;
};

const hasValue = (action: unknown): action is ButtonActionWithValue => {
  return typeof action === "object" && action !== null && "value" in action;
};

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

export const handleStopButton: SlackButtonActionHandler = async ({
  ack,
  body,
  client,
}) => {
  await ack();

  try {
    const channel = body.channel;
    const message = body.message;

    if (!channel?.id || !message?.ts) {
      logger.error("Missing channel or message data in stop button handler");
      return;
    }

    const codexService = CodexService.getInstance();
    const processKey = codexService.createProcessKey(channel.id, message.ts);

    logger.info("Stop button pressed", { processKey });

    if (await codexService.stopProcess(processKey)) {
      const currentOutput = outputBuffer.get(processKey);

      await client.chat.update({
        channel: channel.id,
        ts: message.ts,
        blocks: createStoppedBlock(currentOutput),
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
    logger.error("Error handling stop button:", error as Error);
  }
};

const handleSendSuggestion: SlackButtonActionHandler = async ({
  ack,
  body,
  client,
}) => {
  await ack();

  try {
    const channel = body.channel;
    const message = body.message;
    const actions = body.actions;

    if (!channel?.id || !message?.ts || !actions?.[0]) {
      logger.error("Missing data in send suggestion handler");
      return;
    }

    const codexService = CodexService.getInstance();
    const processKey = codexService.createProcessKey(channel.id, message.ts);
    const suggestion = hasValue(actions[0]) ? actions[0].value : undefined;

    logger.info("Suggestion button pressed", { processKey, suggestion });

    if (suggestion && (await codexService.isProcessRunning(processKey))) {
      // Codexプロセスに提案を送信
      logger.info("Sending suggestion to Codex process", {
        processKey,
        suggestion,
      });
      const success = await codexService.sendInput(processKey, suggestion);

      if (success) {
        logger.info("Suggestion successfully sent to Codex", { processKey });
      } else {
        logger.error("Failed to send suggestion to Codex", { processKey });
      }

      // UIを更新して送信したことを示す
      const currentOutput = outputBuffer.get(processKey);
      const updatedOutput = `${currentOutput}\n> ${suggestion}`;
      outputBuffer.set(processKey, updatedOutput);

      await client.chat.update({
        channel: channel.id,
        ts: message.ts,
        blocks: createOutputBlock(truncateOutput(updatedOutput), true),
      });
    } else {
      await client.chat.postEphemeral({
        channel: channel.id,
        user: body.user.id,
        text: "❌ プロセスが見つからないか、既に停止しています。",
      });
    }
  } catch (error) {
    logger.error("Error handling suggestion button:", error as Error);
  }
};

const handleOpenInputModal: SlackButtonActionHandler = async ({
  ack,
  body,
  client,
}) => {
  await ack();

  try {
    const channel = body.channel;
    const message = body.message;
    const actions = body.actions;
    const trigger_id = body.trigger_id;

    if (!channel?.id || !message?.ts || !actions?.[0] || !trigger_id) {
      logger.error("Missing data in open input modal handler");
      return;
    }

    const codexService = CodexService.getInstance();
    const processKey = codexService.createProcessKey(channel.id, message.ts);
    const buttonValueString = hasValue(actions[0])
      ? actions[0].value || "{}"
      : "{}";
    const buttonValue = JSON.parse(buttonValueString);

    logger.info("Open input modal button pressed", { processKey, buttonValue });

    if (codexService.isProcessRunning(processKey)) {
      // モーダルを開く
      await client.views.open({
        trigger_id: trigger_id,
        view: createInputModal(
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
    logger.error("Error handling open input modal button:", error as Error);
  }
};

const handleInputModalSubmission: SlackViewSubmissionHandler = async ({
  ack,
  body,
  client,
}) => {
  await ack();

  try {
    const view = body.view;
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
      logger.info("Sending input to Codex process", {
        processKey,
        inputText: inputText.trim(),
      });
      const success = await codexService.sendInput(
        processKey,
        inputText.trim()
      );

      if (success) {
        logger.info("Input successfully sent to Codex", { processKey });
      } else {
        logger.error("Failed to send input to Codex", { processKey });
      }

      // UIを更新して送信したことを示す
      const currentOutput = outputBuffer.get(processKey);
      const updatedOutput = `${currentOutput}\n> ${inputText.trim()}`;
      outputBuffer.set(processKey, updatedOutput);

      // プロセスキーから channel と ts を抽出
      const [channel, ts] = processKey.split("-");

      await client.chat.update({
        channel: channel,
        ts: ts,
        blocks: createOutputBlock(truncateOutput(updatedOutput), true),
      });
    } else {
      logger.warn("Cannot send input: process not running", { processKey });
    }
  } catch (error) {
    logger.error("Error handling input modal submission:", error as Error);
  }
};

export {
  outputBuffer,
  handleSendSuggestion,
  handleOpenInputModal,
  handleInputModalSubmission,
};
