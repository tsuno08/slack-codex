export const processCodexOutput = (rawOutput: string): string => {
  // codexという単語の後の改行を適切に処理
  return rawOutput
    .replace(/codex\n/gi, "codex\n") // codexの後の改行を正規化
    .replace(/\r\n/g, "\n") // Windows改行コードを統一
    .replace(/\r/g, "\n"); // Mac古い改行コードを統一
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

export const extractCodexOutput = (data: string): string | null => {
  const pattern = /codex\s([\s\S]*?)╭──────────────────────────────────────────────────────────────────────────────╮/;
  const match = pattern.exec(data);
  return match ? match[1].trim() : null;
};
