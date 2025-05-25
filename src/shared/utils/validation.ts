export const isValidEnv = (key: string): boolean => {
  return !!process.env[key];
};

export const getRequiredEnv = (key: string): string => {
  const value = process.env[key];
  if (!value) {
    throw new Error(`${key} environment variable is required`);
  }
  return value;
};
