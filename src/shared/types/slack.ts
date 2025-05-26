// Slack関連の型定義
export type SlackConfig = {
  botToken: string;
  appToken: string;
  signingSecret: string;
};

// Slack Bolt ライブラリの型をインポート
import type {
  AllMiddlewareArgs,
  BlockAction,
  BlockElementAction,
  SlackActionMiddlewareArgs,
  SlackEventMiddlewareArgs,
  SlackViewMiddlewareArgs,
  ViewSubmitAction,
} from "@slack/bolt";
import type { WebClient } from "@slack/web-api";

// Slackイベント関連の型定義
export type SlackEvent = {
  type: string;
  channel: string;
  user: string;
  text: string;
  ts: string;
  thread_ts?: string;
  event_ts: string;
};

export type SlackClient = WebClient;

export type SlackButtonActionHandler = (
  args: SlackActionMiddlewareArgs<BlockAction<BlockElementAction>> &
    AllMiddlewareArgs
) => Promise<void>;

export type SlackAppMentionHandler = (
  args: SlackEventMiddlewareArgs<"app_mention"> & AllMiddlewareArgs
) => Promise<void>;

export type SlackViewSubmissionHandler = (
  args: SlackViewMiddlewareArgs<ViewSubmitAction> & AllMiddlewareArgs
) => Promise<void>;
