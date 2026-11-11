/** The approval can arrive before the thread is saved as paused. Keep looking for about 15 seconds, and stop early when the page has moved on. */
export async function waitUntilPaused(
  readStatus: () => Promise<string | null>,
  shouldStop: () => boolean = () => false,
): Promise<boolean> {
  for (let attempt = 0; attempt < 30; attempt++) {
    if (shouldStop()) return false;
    if (await readStatus() === 'interrupted') return true;
    if (attempt < 29) await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

/** A saved approval is real only while the thread is paused. A busy thread can still list the approval that already started a running tool. */
export function savedInterruptIfPaused<T>(status: string | null, interrupt: T | null): T | null {
  if (status !== 'interrupted' || !interrupt) return null;
  return interrupt;
}

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
