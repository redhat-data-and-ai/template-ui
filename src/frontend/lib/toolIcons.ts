import type { ComponentType } from "react";
import {
  CogIcon,
  FileAltIcon,
  FolderOpenIcon,
  TerminalIcon,
} from "@patternfly/react-icons";
import type { SVGIconProps } from "@patternfly/react-icons/dist/esm/createIcon";

const toolIconMap: Record<string, ComponentType<SVGIconProps>> = {
  ls: FolderOpenIcon,
  read_file: FileAltIcon,
  execute: TerminalIcon,
};

export function getToolIcon(toolName: string): ComponentType<SVGIconProps> {
  return toolIconMap[toolName] ?? CogIcon;
}
