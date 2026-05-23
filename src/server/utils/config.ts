export const agentHost = process.env.AGENT_HOST || "http://localhost:5002";

let _agentName: string | null = null;

export async function getAgentName(): Promise<string> {
  if (_agentName !== null) return _agentName;
  try {
    const resp = await fetch(`${agentHost}/info`, { signal: AbortSignal.timeout(3000) });
    if (resp.ok) {
      const data = await resp.json() as { name?: string };
      _agentName = data.name || "Agent";
    } else {
      _agentName = "Agent";
    }
  } catch {
    _agentName = "Agent";
  }
  return _agentName;
}