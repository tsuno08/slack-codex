import { formatCodexForSlack } from "./codex";

export const truncateOutput = (
  output: string,
  maxLength: number = 2900
): string => {
  if (output.length <= maxLength) {
    return output;
  }
  return "...\n" + output.slice(-(maxLength - 10));
};

export const formatCodeBlock = (
  content: string,
  language: string = ""
): string => {
  return `\`\`\`${language}\n${content}\n\`\`\``;
};

// 後方互換性のためのエイリアス
export const formatCodexOutput = formatCodexForSlack;
