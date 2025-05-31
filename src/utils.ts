import stripAnsi from "strip-ansi";

export const cleanCodexOutput = (output: string): string => {
  // ANSI エスケープシーケンスを除去（ライブラリを使用）
  const cleanedOutput = stripAnsi(output);

  return (
    cleanedOutput
      // biome-ignore lint/suspicious/noControlCharactersInRegex: Control characters cleanup is intentional
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "") // 制御文字（改行・タブ以外）
      .replace(/codex\n/gi, "codex\n") // codexの後の改行を正規化
      .replace(/\r\n/g, "\n") // Windows改行コードを統一
      .replace(/\r/g, "\n") // Mac古い改行コードを統一
      .replace(/\n{3,}/g, "\n\n") // 連続する空行を2行までに制限
      .trim()
  );
};

export const extractMentionText = (text: string): string => {
  // ボットメンションとユーザーメンションを除去
  return text
    .replace(/<@[UW][A-Z0-9]+>/g, "") // ユーザー・ボットメンション
    .replace(/<#[A-Z0-9]+\|[^>]+>/g, "") // チャンネルメンション
    .replace(/<!here>/g, "") // @here
    .replace(/<!channel>/g, "") // @channel
    .trim();
};

export const extractCodexOutput = (data: string) => {
  const pattern =
    /codex\s([\s\S]*)╭──────────────────────────────────────────────────────────────────────────────╮/;
  const match = pattern.exec(data);
  return match?.[1].trim();
};
