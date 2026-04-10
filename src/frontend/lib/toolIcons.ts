import {
  FolderOpen,
  FileText,
  Terminal,
  Settings,
  type LucideIcon,
} from "lucide-react";

const toolIconMap: Record<string, LucideIcon> = {
  ls: FolderOpen,
  read_file: FileText,
  execute: Terminal,
};

export function getToolIcon(toolName: string): LucideIcon {
  return toolIconMap[toolName] ?? Settings;
}

const subagentNames = new Set<string>([
  // Add your subagent names here
]);

export function getToolLabel(toolName: string): string {
  return subagentNames.has(toolName) ? "Subagent" : "Tool";
}
