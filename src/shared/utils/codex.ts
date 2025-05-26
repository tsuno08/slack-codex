import stripAnsi from "strip-ansi";

// Codex応答の処理ユーティリティ
export const processCodexOutput = (rawOutput: string): string => {
  // codexという単語の後の改行を適切に処理
  return rawOutput
    .replace(/codex\n/gi, "codex\n") // codexの後の改行を正規化
    .replace(/\r\n/g, "\n") // Windows改行コードを統一
    .replace(/\r/g, "\n"); // Mac古い改行コードを統一
};

export const cleanCodexOutput = (output: string): string => {
  // ANSI エスケープシーケンスを除去（ライブラリを使用）
  const cleanedOutput = stripAnsi(output);

  return (
    cleanedOutput
      // biome-ignore lint/suspicious/noControlCharactersInRegex: Control characters cleanup is intentional
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "") // 制御文字（改行・タブ以外）
      .replace(/\n{3,}/g, "\n\n") // 連続する空行を2行までに制限
      .trim()
  );
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
