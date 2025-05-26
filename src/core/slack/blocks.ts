import type { Block, KnownBlock } from "@slack/types";
import { formatCodexForSlack } from "../../shared/utils/codex";

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

export const createCompletedBlock = (
  output: string,
  code: number | null
): (Block | KnownBlock)[] => {
  const formattedOutput = formatCodexForSlack(output);

  return [
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

  return [
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
