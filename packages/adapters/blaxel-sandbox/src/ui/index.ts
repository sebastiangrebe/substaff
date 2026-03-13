import type { TranscriptEntry, StdoutLineParser } from "@substaff/adapter-utils";

export const parseBlaxelStdoutLine: StdoutLineParser = (line: string, ts: string): TranscriptEntry[] => {
  if (line === "[keepalive]") {
    return [];
  }
  if (line.startsWith("[blaxel]")) {
    return [{ kind: "system", ts, text: line }];
  }
  return [{ kind: "stdout", ts, text: line }];
};
