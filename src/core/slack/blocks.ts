import type { Block, KnownBlock } from "@slack/types";
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
