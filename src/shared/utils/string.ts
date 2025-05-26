export const truncateOutput = (output: string, maxLength = 2900): string => {
  if (output.length <= maxLength) {
    return output;
  }
  return `...\n${output.slice(-(maxLength - 10))}`;
};
