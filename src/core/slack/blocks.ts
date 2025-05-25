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

  static createInactivityLoadingBlock = (): (Block | KnownBlock)[] => [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "⏳ Codexが処理中です...",
      },
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: "_5秒以上出力がありません。処理が続行されています。_",
        },
      ],
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

  static createInputPromptBlock = (
    output: string,
    promptType: "explanation" | "general",
    suggestion?: string
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
          text: `💻 実行中: \`${codexCommand}\``,
        },
      });
    }

    // 出力表示
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `\`\`\`\n${formattedOutput}\n\`\`\``,
      },
    });

    // 入力待ち状態の説明
    const promptMessage =
      promptType === "explanation"
        ? "💬 Codexが説明を求めています。以下のようなメッセージを送信してください："
        : "💬 Codexが入力を待っています。メッセージを送信してください：";

    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: promptMessage,
      },
    });

    // 提案がある場合のボタン
    if (suggestion) {
      blocks.push({
        type: "actions",
        elements: [
          {
            type: "button",
            text: {
              type: "plain_text",
              text: "✍️ 入力",
              emoji: true,
            },
            style: "primary",
            action_id: "open_input_modal",
            value: JSON.stringify({ promptType, suggestion }),
          },
          {
            type: "button",
            text: {
              type: "plain_text",
              text: `💡 "${suggestion}"`,
              emoji: true,
            },
            action_id: "send_suggestion",
            value: suggestion,
          },
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
    } else {
      // 一般的な入力待ちの場合は入力ボタンと停止ボタン
      blocks.push({
        type: "actions",
        elements: [
          {
            type: "button",
            text: {
              type: "plain_text",
              text: "✍️ 入力",
              emoji: true,
            },
            style: "primary",
            action_id: "open_input_modal",
            value: JSON.stringify({ promptType: promptType || "general" }),
          },
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

  static createOutputWithInactivityBlock = (
    output: string,
    isRunning: boolean = true
  ): (Block | KnownBlock)[] => {
    // 通常の出力ブロックを取得
    const outputBlocks = SlackBlockService.createOutputBlock(output, isRunning);

    // 非アクティビティローディングブロックを追加
    const inactivityBlocks = SlackBlockService.createInactivityLoadingBlock();

    // 結合して返す
    return [...outputBlocks, ...inactivityBlocks];
  };

  static createInputModal = (
    processKey: string,
    promptType: "explanation" | "general",
    suggestion?: string
  ) => {
    const titleText =
      promptType === "explanation" ? "Codex説明入力" : "Codex入力";

    const placeholderText =
      promptType === "explanation"
        ? "コードベースの説明を入力してください..."
        : "Codexへの入力を記述してください...";

    return {
      type: "modal",
      callback_id: "codex_input_modal",
      title: {
        type: "plain_text",
        text: titleText,
        emoji: true,
      },
      submit: {
        type: "plain_text",
        text: "送信",
        emoji: true,
      },
      close: {
        type: "plain_text",
        text: "キャンセル",
        emoji: true,
      },
      private_metadata: JSON.stringify({ processKey, promptType }),
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text:
              promptType === "explanation"
                ? "💬 Codexがコードベースの説明を求めています。"
                : "💬 Codexが入力を待っています。",
          },
        },
        {
          type: "input",
          block_id: "input_block",
          element: {
            type: "plain_text_input",
            action_id: "input_text",
            placeholder: {
              type: "plain_text",
              text: placeholderText,
            },
            multiline: true,
            initial_value: suggestion || "",
          },
          label: {
            type: "plain_text",
            text: "入力内容",
            emoji: true,
          },
        },
      ],
    };
  };
}
