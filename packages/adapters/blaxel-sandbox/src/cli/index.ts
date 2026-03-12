export function printBlaxelStreamEvent(line: string, _debug: boolean): void {
  if (line.startsWith("[blaxel]")) {
    process.stderr.write(`\x1b[36m${line}\x1b[0m\n`);
  } else {
    process.stdout.write(`${line}\n`);
  }
}
