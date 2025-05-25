import { Block, KnownBlock } from "@slack/types";
import { formatCodexForSlack, extractCodexCommand } from "../../shared/utils";

export class SlackBlockService {
  static createLoadingBlock = (): (Block | KnownBlock)[] => [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "🔄 Codexを起動しています...",
      },
    },
  ];

  static createOutputBlock = (
    output: string,
    isRunning: boolean = true
  ): (Block | KnownBlock)[] => {
    // Codex特有の出力処理を適用
    const formattedOutput = formatCodexForSlack(output);
    const codexCommand = extractCodexCommand(output);

    const blocks: (Block | KnownBlock)[] = [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `\`\`\`\n${formattedOutput}\n\`\`\``,
        },
      },
    ];

    // コマンドが検出された場合、それを表示
    if (codexCommand) {
      blocks.unshift({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `💻 実行中: \`${codexCommand}\``,
        },
      });
    }

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

  static createCompletedBlock = (
    output: string,
    code: number | null
  ): (Block | KnownBlock)[] => {
    // Codex特有の出力処理を適用
    const formattedOutput = formatCodexForSlack(output);
    const codexCommand = extractCodexCommand(output);

    const blocks: (Block | KnownBlock)[] = [];

    // コマンドが検出された場合、それを表示
    if (codexCommand) {
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `💻 実行完了: \`${codexCommand}\``,
        },
      });
    }

    blocks.push(
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `\`\`\`\n${formattedOutput}\n\`\`\``,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: code === 0 ? "✅ 完了" : "❌ エラー",
        },
      }
    );

    return blocks;
  };

  static createStoppedBlock = (output: string): (Block | KnownBlock)[] => {
    // Codex特有の出力処理を適用
    const formattedOutput = formatCodexForSlack(output);
    const codexCommand = extractCodexCommand(output);

    const blocks: (Block | KnownBlock)[] = [];

    // コマンドが検出された場合、それを表示
    if (codexCommand) {
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `💻 停止されたコマンド: \`${codexCommand}\``,
        },
      });
    }

    blocks.push(
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `\`\`\`\n${formattedOutput}\n\`\`\``,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "⏹️ 停止しました",
        },
      }
    );

    return blocks;
  };
}
