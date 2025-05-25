export const truncateOutput = (
  output: string,
  maxLength: number = 2900
): string => {
  if (output.length <= maxLength) {
    return output;
  }
  return "...\n" + output.slice(-(maxLength - 10));
};
