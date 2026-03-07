import type { TranscriptEntry } from "@substaff/adapter-utils";

export function parseOpenClawStdoutLine(line: string, ts: string): TranscriptEntry[] {
  return [{ kind: "stdout", ts, text: line }];
}
