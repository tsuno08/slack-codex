import stripAnsi from "strip-ansi";

// Codex応答の処理ユーティリティ
export const processCodexOutput = (rawOutput: string): string => {
  // codexという単語の後の改行を適切に処理
  return rawOutput
    .replace(/codex\n/gi, "codex\n") // codexの後の改行を正規化
    .replace(/\r\n/g, "\n") // Windows改行コードを統一
    .replace(/\r/g, "\n"); // Mac古い改行コードを統一
};

export const extractCodexCommand = (output: string): string | null => {
  // 出力からcodexコマンドの実行部分を抽出
  const lines = output.split("\n");

  for (const line of lines) {
    if (line.toLowerCase().includes("codex") && line.includes("--")) {
      return line.trim();
    }
  }

  return null;
};

export const cleanCodexOutput = (output: string): string => {
  // ANSI エスケープシーケンスを除去（ライブラリを使用）
  const cleanedOutput = stripAnsi(output);
  
  return cleanedOutput
    // biome-ignore lint/suspicious/noControlCharactersInRegex: Control characters cleanup is intentional
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "") // 制御文字（改行・タブ以外）
    .replace(/\n{3,}/g, "\n\n") // 連続する空行を2行までに制限
    .trim();
};

export const formatCodexForSlack = (output: string): string => {
  // Slack用に特別に最適化されたCodex出力フォーマット
  let processed = processCodexOutput(output);
  processed = cleanCodexOutput(processed);

  // コマンド行を強調
  const lines = processed.split("\n");
  const formattedLines = lines.map((line: string) => {
    // codexコマンドの実行行
    if (
      line.toLowerCase().includes("codex") &&
      (line.includes("--") || line.includes(">"))
    ) {
      return `💻 ${line}`;
    }

    // エラー行
    if (
      line.toLowerCase().includes("error") ||
      line.toLowerCase().includes("failed")
    ) {
      return `❌ ${line}`;
    }

    // 成功メッセージ
    if (
      line.toLowerCase().includes("success") ||
      line.toLowerCase().includes("completed")
    ) {
      return `✅ ${line}`;
    }

    return line;
  });

  return formattedLines.join("\n");
};

export const detectCodexInputPrompt = (
  output: string
): {
  isWaitingForInput: boolean;
  promptType: "explanation" | "general" | null;
  suggestion?: string;
} => {
  // Codexが入力を待っている状態を検出
  const lines = output.split("\n");
  const lastFewLines = lines.slice(-5).join("\n").toLowerCase();

  // "try: explain this codebase to me" パターン
  if (
    lastFewLines.includes("try:") &&
    lastFewLines.includes("explain this codebase")
  ) {
    return {
      isWaitingForInput: true,
      promptType: "explanation",
      suggestion: "explain this codebase to me",
    };
  }

  // "enter to send" パターン
  if (lastFewLines.includes("enter to send")) {
    return {
      isWaitingForInput: true,
      promptType: "general",
      suggestion: undefined,
    };
  }

  // その他の入力待ちパターン
  const inputPromptPatterns = [
    /press\s+enter/i,
    /waiting\s+for\s+input/i,
    /enter\s+your\s+response/i,
    /type\s+your\s+message/i,
    />\s*$/m, // プロンプト記号で終わる
  ];

  const hasInputPrompt = inputPromptPatterns.some((pattern) =>
    pattern.test(output)
  );

  return {
    isWaitingForInput: hasInputPrompt,
    promptType: hasInputPrompt ? "general" : null,
    suggestion: undefined,
  };
};
