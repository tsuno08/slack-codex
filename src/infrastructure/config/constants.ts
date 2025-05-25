export const CONSTANTS = {
  PROCESS_START_TIMEOUT: 3000,
  MAX_OUTPUT_LENGTH: 2900,
  PTY_CONFIG: {
    name: "xterm-color",
    cols: 80,
    rows: 30,
    env: {
      TERM: "xterm-256color",
      FORCE_COLOR: "1",
    },
  },
} as const;
