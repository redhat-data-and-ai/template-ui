/** A server snapshot may replace the screen only when every saved message is still in it. */
export function serverKeepsLocalMessages(
  local: ReadonlyArray<{ id?: string | null }>,
  server: ReadonlyArray<{ id?: string | null }>,
): boolean {
  if (server.length === 0) return false;
  const serverIds = new Set<string>();
  for (const message of server) {
    if (message.id) serverIds.add(message.id);
  }
  return local.every((message) => !message.id || serverIds.has(message.id));
}
