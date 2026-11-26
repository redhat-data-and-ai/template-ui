import type { Message } from '@langchain/langgraph-sdk';

type TranscriptCall = { id?: string; transcript?: unknown };

function toolCallsOf(message: Message): TranscriptCall[] {
  const calls = (message as Message & { tool_calls?: TranscriptCall[] }).tool_calls;
  return Array.isArray(calls) ? calls : [];
}

/** Keep a subagent stream that exists only on the messages already on screen. */
export function withLocalTranscripts(local: Message[], server: Message[]): Message[] {
  const transcripts = new Map<string, unknown>();
  for (const message of local) {
    for (const call of toolCallsOf(message)) {
      if (call.id && call.transcript) transcripts.set(call.id, call.transcript);
    }
  }
  if (transcripts.size === 0) return server;
  return server.map((message) => {
    const calls = toolCallsOf(message);
    if (calls.length === 0) return message;
    let changed = false;
    const tool_calls = calls.map((call) => {
      if (!call.id || !transcripts.has(call.id)) return call;
      changed = true;
      return { ...call, transcript: transcripts.get(call.id) };
    });
    return changed ? { ...message, tool_calls } as Message : message;
  });
}
