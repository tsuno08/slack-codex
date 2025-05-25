export class SlackUtils {
  static extractMentionText = (text: string): string => {
    // ボットメンションとユーザーメンションを除去
    return text
      .replace(/<@[UW][A-Z0-9]+>/g, "") // ユーザー・ボットメンション
      .replace(/<#[A-Z0-9]+\|[^>]+>/g, "") // チャンネルメンション
      .replace(/<!here>/g, "") // @here
      .replace(/<!channel>/g, "") // @channel
      .trim();
  };
}
