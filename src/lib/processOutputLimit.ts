export const DEFAULT_PROCESS_OUTPUT_LIMIT_BYTES = 200 * 1024;

export function createLimitedOutputCollector(maxBytes: number) {
  let output = "";
  let usedBytes = 0;
  let wasExceeded = false;

  return {
    append(chunk: Buffer | string) {
      if (wasExceeded) return;

      const text = chunk.toString();
      const remainingBytes = maxBytes - usedBytes;
      const chunkBytes = Buffer.byteLength(text, "utf8");

      if (chunkBytes <= remainingBytes) {
        output += text;
        usedBytes += chunkBytes;
        return;
      }

      let kept = "";
      let keptBytes = 0;
      for (const char of text) {
        const charBytes = Buffer.byteLength(char, "utf8");
        if (keptBytes + charBytes > remainingBytes) break;
        kept += char;
        keptBytes += charBytes;
      }

      output += kept;
      usedBytes += keptBytes;
      wasExceeded = true;
    },
    exceeded() {
      return wasExceeded;
    },
    value() {
      return output;
    },
  };
}
