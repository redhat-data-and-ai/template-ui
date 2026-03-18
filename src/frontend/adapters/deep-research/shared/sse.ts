export function parseSSEChunk(raw: string): { dataStr: string; eventType: string } {
  let eventType = "";
  const dataLines: string[] = [];

  for (const line of raw.replaceAll("\r\n", "\n").split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("event: ")) {
      eventType = trimmed.slice(7).trim();
    } else if (trimmed.startsWith("data: ")) {
      dataLines.push(trimmed.slice(6));
    } else if (trimmed.startsWith("{")) {
      dataLines.push(trimmed);
    }
  }

  return { dataStr: dataLines.join("\n"), eventType };
}
