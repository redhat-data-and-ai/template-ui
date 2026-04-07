import {
  FolderOpen,
  FileText,
  Terminal,
  HeartPulse,
  Dumbbell,
  Mail,
  UtensilsCrossed,
  Settings,
  type LucideIcon,
} from "lucide-react";

const toolIconMap: Record<string, LucideIcon> = {
  ls: FolderOpen,
  read_file: FileText,
  execute: Terminal,
  analyst: HeartPulse,
  trainer: Dumbbell,
  publisher: Mail,
  dietician: UtensilsCrossed,
};

export function getToolIcon(toolName: string): LucideIcon {
  return toolIconMap[toolName] ?? Settings;
}

const subagentNames = new Set([
  "analyst",
  "trainer",
  "publisher",
  "dietician",
]);

export function getToolLabel(toolName: string): string {
  return subagentNames.has(toolName) ? "Subagent" : "Tool";
}
