// Codex応答の処理ユーティリティ
export const processCodexOutput = (rawOutput: string): string => {
  // codexという単語の後の改行を適切に処理
  return rawOutput
    .replace(/codex\n/gi, "codex\n") // codexの後の改行を正規化
    .replace(/\r\n/g, "\n") // Windows改行コードを統一
    .replace(/\r/g, "\n"); // Mac古い改行コードを統一
};

export const isCodexResponseComplete = (output: string): boolean => {
  // Codexの応答が完了したかを判定
  // 通常、プロンプトが再度表示されるか、特定のパターンで終了する
  const lines = output.split("\n");
  const lastLine = lines[lines.length - 1];

  // プロンプト表示やコマンド完了の一般的なパターン
  return (
    lastLine.includes("$") ||
    lastLine.includes("❯") ||
    lastLine.includes(">") ||
    output.includes("Process finished") ||
    output.includes("Command completed")
  );
};

export const detectCodexCompletion = (output: string): boolean => {
  // Codexプロセスが完了したことを検出
  const completionPatterns = [
    /process\s+finished/i,
    /command\s+completed/i,
    /execution\s+finished/i,
    /codex\s+session\s+ended/i,
    /^\s*[\$>❯]\s*$/m, // プロンプト表示
  ];

  return completionPatterns.some((pattern) => pattern.test(output));
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

export const extractCodexErrors = (output: string): string[] => {
  // Codex出力からエラーメッセージを抽出
  const errorPatterns = [
    /error:\s*(.+)/gi,
    /failed:\s*(.+)/gi,
    /exception:\s*(.+)/gi,
    /traceback/gi,
  ];

  const errors: string[] = [];
  const lines = output.split("\n");

  for (const line of lines) {
    for (const pattern of errorPatterns) {
      const match = pattern.exec(line);
      if (match) {
        errors.push(match[1] || line.trim());
      }
    }
  }

  return errors;
};

export const cleanCodexOutput = (output: string): string => {
  // ANSI エスケープシーケンスと不要な制御文字を除去
  return output
    .replace(/\x1b\[[0-9;]*m/g, "") // ANSI カラーコード
    .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "") // その他のANSIエスケープ
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
