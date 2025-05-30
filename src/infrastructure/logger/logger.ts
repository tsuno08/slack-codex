export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

// ログ引数として受け入れ可能な型
type LogArgument =
  | string
  | number
  | boolean
  | object
  | null
  | undefined
  | Error;

// 純粋関数: ログメッセージ生成
const createLogMessage = (
  level: LogLevel,
  message: string,
  ...args: LogArgument[]
): string => {
  const timestamp = new Date().toISOString();
  const levelName = LogLevel[level];
  return `[${timestamp}] ${levelName}: ${message} ${args
    .map((arg) => (typeof arg === "object" ? JSON.stringify(arg) : String(arg)))
    .join(" ")}`;
};

// 副作用: ログ出力
const outputLog = (level: LogLevel, formatted: string): void => {
  switch (level) {
    case LogLevel.DEBUG:
      console.debug(formatted);
      break;
    case LogLevel.INFO:
      console.info(formatted);
      break;
    case LogLevel.WARN:
      console.warn(formatted);
      break;
    case LogLevel.ERROR:
      console.error(formatted);
      break;
  }
};

// ログ処理コア (カリー化関数)
export const createLogger =
  (currentLevel: LogLevel) =>
  (level: LogLevel, message: string, ...args: LogArgument[]): void => {
    if (level < currentLevel) return;
    const formatted = createLogMessage(level, message, ...args);
    outputLog(level, formatted);
  };

// 各レベルのロガー関数 (ログレベル固定)
export const debug =
  (currentLevel: LogLevel) =>
  (message: string, ...args: LogArgument[]) =>
    createLogger(currentLevel)(LogLevel.DEBUG, message, ...args);

export const info =
  (currentLevel: LogLevel) =>
  (message: string, ...args: LogArgument[]) =>
    createLogger(currentLevel)(LogLevel.INFO, message, ...args);

export const warn =
  (currentLevel: LogLevel) =>
  (message: string, ...args: LogArgument[]) =>
    createLogger(currentLevel)(LogLevel.WARN, message, ...args);

export const error =
  (currentLevel: LogLevel) =>
  (message: string, ...args: LogArgument[]) =>
    createLogger(currentLevel)(LogLevel.ERROR, message, ...args);

// デフォルトロガー生成関数
export const createDefaultLogger = () => {
  const level =
    process.env.NODE_ENV === "development" ? LogLevel.DEBUG : LogLevel.INFO;

  return {
    debug: debug(level),
    info: info(level),
    warn: warn(level),
    error: error(level),
  };
};

// 既存コードとの互換性のためデフォルトロガーをエクスポート
export const logger = createDefaultLogger();
