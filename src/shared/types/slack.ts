// Slack関連の型定義
export type SlackMessage = {
  channel: string;
  ts: string;
  user: string;
  text: string;
};

export type SlackEvent = {
  channel: string;
  ts: string;
  user: string;
  text: string;
};

export type ButtonAction = {
  type: "button";
  action_id: string;
  block_id: string;
  text: {
    type: "plain_text";
    text: string;
  };
  value: string;
};

export type SlackConfig = {
  botToken: string;
  appToken: string;
  signingSecret: string;
};
