import { CodexService } from "../../core/codex/manager";
import { createOutputBlock, createStoppedBlock } from "../../core/slack/blocks";
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

  delete = (key: string): void => {
    this.buffer.delete(key);
  };
}

export const outputBuffer = OutputBufferManager.getInstance();

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

export const handleSendSuggestion: SlackButtonActionHandler = async ({
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

    if (suggestion && codexService.isProcessRunning(processKey)) {
      // Codexプロセスに提案を送信
      logger.info("Sending suggestion to Codex process", {
        processKey,
        suggestion,
      });
      const success = codexService.sendInput(processKey, suggestion);

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

export const handleOpenInputModal: SlackButtonActionHandler = async ({
  ack,
  body,
  client,
  context,
}) => {
  await ack();

  try {
    const channel = body.channel;
    const message = body.message;
    const actions = body.actions;
    const user = body.user;

    if (!channel?.id || !message?.ts || !actions?.[0]) {
      logger.error("Missing data in open input modal handler");
      await client.chat.postEphemeral({
        channel: channel?.id || user.id,
        user: user.id,
        text: "エラーが発生しました。必要な情報が不足しています。",
      });
      return;
    }

    // trigger_id はモーダルを開く場合にのみ必要なので、ここでは不要

    const codexService = CodexService.getInstance();
    const processKey = codexService.createProcessKey(channel.id, message.ts);
    const buttonValueString = hasValue(actions[0])
      ? actions[0].value || "{}"
      : "{}";
    const buttonValue = JSON.parse(buttonValueString);

    logger.info("Open input modal button pressed, redirecting to app_mention", {
      processKey,
      buttonValue,
    });

    if (codexService.isProcessRunning(processKey)) {
      const botUserId = context.botUserId;
      const botMention = botUserId ? `<@${botUserId}>` : "@bot"; // contextからbotUserIdを取得

      await client.chat.postMessage({
        channel: channel.id,
        thread_ts: message.ts, // 元のメッセージのスレッドに投稿
        text: `次の入力は ${botMention} に続けてメンションで送信してください。\n例: \`${botMention} [あなたの入力]\``,
      });
    } else {
      await client.chat.postEphemeral({
        channel: channel.id,
        user: body.user.id,
        text: "❌ プロセスが見つからないか、既に停止しているため入力を受け付けられません。",
      });
    }
  } catch (error) {
    logger.error("Error handling open input modal button:", error as Error);
    await client.chat.postEphemeral({
      channel: body.channel?.id || body.user.id,
      user: body.user.id,
      text: "処理中にエラーが発生しました。",
    });
  }
};

export const handleInputModalSubmission: SlackViewSubmissionHandler = async ({
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
