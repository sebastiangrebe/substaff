import type { TranscriptEntry, StdoutLineParser } from "@substaff/adapter-utils";

export const parseE2BStdoutLine: StdoutLineParser = (line: string, ts: string): TranscriptEntry[] => {
  if (line.startsWith("[e2b]")) {
    return [{ kind: "system", ts, text: line }];
  }
  return [{ kind: "stdout", ts, text: line }];
};
