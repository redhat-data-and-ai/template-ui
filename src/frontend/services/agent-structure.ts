export interface AgentNode {
  name: string;
  description?: string;
  model?: string;
  tools?: string[];
  skills?: string[];
  mcps?: string[];
  subagents?: string[];
  body?: string;
}

export interface AgentStructure {
  name: string;
  orchestrator: AgentNode;
  subagents: Record<string, AgentNode>;
  mcp_servers: Record<string, { display_name?: string }>;
  available_skills: string[];
  skill_contents: Record<string, string>;
}

export async function fetchAgentStructure(): Promise<AgentStructure> {
  const basePath = (window.APP_DATA?.basePath || "").replace(/\/$/, "");

  const response = await fetch(
    `${basePath}/api/config/agent-structure`,
    { cache: "no-store" },
  );

  if (!response.ok) {
    throw new Error("Failed to load agent structure");
  }

  return response.json();
}
