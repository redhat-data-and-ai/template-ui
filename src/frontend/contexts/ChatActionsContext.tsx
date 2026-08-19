import { createContext, useContext, type ReactNode } from "react";

export interface McpModelContextUpdate {
  content?: unknown[];
  structuredContent?: Record<string, unknown>;
}

export interface ChatActions {
  /** Send a user message and trigger a model turn (same path as the composer). */
  sendUserMessage: (text: string) => Promise<void>;
  /**
   * Overwrite pending MCP App model context for the next turn.
   * Does not trigger a model turn (SEP-1865 ui/update-model-context).
   */
  setMcpModelContext: (update: McpModelContextUpdate | null) => void;
}

const ChatActionsContext = createContext<ChatActions | null>(null);

export function ChatActionsProvider({
  value,
  children,
}: {
  value: ChatActions;
  children: ReactNode;
}) {
  return (
    <ChatActionsContext.Provider value={value}>{children}</ChatActionsContext.Provider>
  );
}

// Hook colocated with provider (standard React context pattern).
// eslint-disable-next-line react-refresh/only-export-components
export function useChatActions(): ChatActions | null {
  return useContext(ChatActionsContext);
}
