import type { InterruptPayload } from '@/lib/streaming/StreamingManager';
import type { HITLInterruptValue, InterruptInfo } from '@/types/deep-agent';

/**
 * Give an interrupt the `payload` the UI renders from.
 *
 * The agent sends an MCP authorization pause as a JSON *string*, so
 * `value` alone is a blob of text and anything reading
 * `interrupt.payload` sees nothing. Parsing it here is what turns the
 * pause into a Connect button.
 *
 * Shared rather than private to the streaming hook: the hook enriched
 * its four stream paths while `ChatPage` stored the raw interrupt
 * when hydrating a thread, so opening a paused conversation showed no
 * Connect box at all and the run looked stuck for no stated reason.
 */
export function enrichInterrupt(
  // `unknown` accepted as well as the stream type: the thread-state
  // reader hands back an untyped value from JSON.
  interrupt: InterruptPayload | { value: unknown; resumable: boolean },
): InterruptInfo {
  const raw = interrupt.value as string | HITLInterruptValue;
  if (
    typeof raw === 'object'
    && raw !== null
    && (raw as { type?: string }).type === 'mcp_auth_required'
  ) {
    return { ...interrupt, value: raw, payload: raw as unknown as NonNullable<InterruptInfo['payload']> };
  }
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (
        parsed
        && typeof parsed === 'object'
        && (parsed as { type?: string }).type === 'mcp_auth_required'
      ) {
        return { ...interrupt, value: raw, payload: parsed as NonNullable<InterruptInfo['payload']> };
      }
    } catch {
      // plain-text interrupt
    }
  }
  return { ...interrupt, value: raw };
}
