import type { Block, KnownBlock, ModalView } from "@slack/types";
import {
  extractCodexCommand,
  formatCodexForSlack,
} from "../../shared/utils/codex";

// 共通のヘルパーメソッド
const createCommandBlock = (
  codexCommand: string | null,
  statusText: string
) => {
  if (!codexCommand) return [];
  return [
    {
      type: "section" as const,
      text: {
        type: "mrkdwn" as const,
        text: `💻 ${statusText}: \`${codexCommand}\``,
      },
    },
  ];
};

const createOutputSection = (formattedOutput: string) => ({
  type: "section" as const,
  text: {
    type: "mrkdwn" as const,
    text: formattedOutput || "\u00A0", // Use non-breaking space if empty
  },
});

export const createLoadingBlock = (): (Block | KnownBlock)[] => [
  {
    type: "section",
    text: {
      type: "mrkdwn",
      text: "処理中...",
    },
  },
];

export const createOutputBlock = (
  output: string,
  isRunning = true
): (Block | KnownBlock)[] => {
  const formattedOutput = formatCodexForSlack(output);
  const codexCommand = extractCodexCommand(output);

  const blocks: (Block | KnownBlock)[] = [
    ...createCommandBlock(codexCommand, "実行中"),
    createOutputSection(formattedOutput),
  ];

  if (isRunning) {
    blocks.push({
      type: "actions",
      elements: [
        {
          type: "button",
          text: {
            type: "plain_text",
            text: "⏹️ 停止",
            emoji: true,
          },
          style: "danger",
          action_id: "stop_codex",
        },
      ],
    });
  }

  return blocks;
};

export const createCompletedBlock = (
  output: string,
  code: number | null
): (Block | KnownBlock)[] => {
  const formattedOutput = formatCodexForSlack(output);
  const codexCommand = extractCodexCommand(output);

  return [
    ...createCommandBlock(codexCommand, "実行完了"),
    createOutputSection(formattedOutput),
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: code === 0 ? "✅ 完了" : "❌ エラー",
      },
    },
  ];
};

export const createStoppedBlock = (output: string): (Block | KnownBlock)[] => {
  const formattedOutput = formatCodexForSlack(output);
  const codexCommand = extractCodexCommand(output);

  return [
    ...createCommandBlock(codexCommand, "停止されたコマンド"),
    createOutputSection(formattedOutput),
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "⏹️ 停止しました",
      },
    },
  ];
};

export const createInputPromptBlock = (): (Block | KnownBlock)[] => {
  return [
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "✍️ 入力", emoji: true },
          style: "primary",
          action_id: "open_input_modal",
        },
        {
          type: "button",
          text: { type: "plain_text", text: "⏹️ 停止", emoji: true },
          style: "danger",
          action_id: "stop_codex",
        },
      ],
    },
  ];
};

export const createInputModal = (
  processKey: string,
  promptType: "explanation" | "general" | "box_input",
  suggestion?: string
): ModalView => {
  const titleText =
    promptType === "explanation"
      ? "Codex説明入力"
      : promptType === "box_input"
      ? "Codex ボックス入力"
      : "Codex入力";

  const placeholderText =
    promptType === "explanation"
      ? "コードベースの説明を入力してください..."
      : promptType === "box_input"
      ? "ボックスパターンの後に入力を続けてください..."
      : "Codexへの入力を記述してください...";

  return {
    type: "modal" as const,
    callback_id: "codex_input_modal",
    title: {
      type: "plain_text" as const,
      text: titleText,
      emoji: true,
    },
    submit: {
      type: "plain_text" as const,
      text: "送信",
      emoji: true,
    },
    close: {
      type: "plain_text" as const,
      text: "キャンセル",
      emoji: true,
    },
    private_metadata: JSON.stringify({ processKey, promptType }),
    blocks: [
      {
        type: "section" as const,
        text: {
          type: "mrkdwn" as const,
          text:
            promptType === "explanation"
              ? "💬 Codexがコードベースの説明を求めています。"
              : promptType === "box_input"
              ? "💬 ボックスパターンに続けて入力してください。"
              : "💬 Codexが入力を待っています。",
        },
      },
      {
        type: "input" as const,
        block_id: "input_block",
        element: {
          type: "plain_text_input" as const,
          action_id: "input_text",
          placeholder: {
            type: "plain_text" as const,
            text: placeholderText,
          },
          multiline: true,
          initial_value: suggestion || "",
        },
        label: {
          type: "plain_text" as const,
          text: "入力内容",
          emoji: true,
        },
      },
    ],
  };
};
