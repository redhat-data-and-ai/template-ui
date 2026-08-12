import { useState } from 'react';
import { ExpandableSection, Label } from '@patternfly/react-core';

export interface McpStatusPanelProps {
  readonly mcpEvents: ReadonlyArray<{ readonly tool: string; readonly status: string; readonly timestamp: number }>;
}

function labelColorForStatus(status: string): 'blue' | 'green' | 'red' {
  const s = status.toLowerCase();
  if (s === 'success' || s === 'completed' || s === 'ok') {
    return 'green';
  }
  if (s === 'error' || s === 'failed') {
    return 'red';
  }
  if (
    s === 'calling' ||
    s === 'pending' ||
    s === 'running' ||
    s === 'in_progress' ||
    s === 'in progress'
  ) {
    return 'blue';
  }
  return 'blue';
}

export function McpStatusPanel({ mcpEvents }: McpStatusPanelProps) {
  const [expanded, setExpanded] = useState(true);

  if (mcpEvents.length === 0) {
    return null;
  }

  return (
    <div className="max-w-3xl mx-auto px-3 pt-2" role="region" aria-label="MCP tool status">
      <ExpandableSection
        toggleText="MCP tool activity"
        isExpanded={expanded}
        onToggle={(_e, isExpanded) => setExpanded(isExpanded)}
        isIndented
        className="pf-v6-u-mb-sm"
      >
        <ul className="list-none m-0 p-0 space-y-2">
          {mcpEvents.map((evt, idx) => (
            <li
              key={`${evt.tool}-${evt.timestamp}-${idx}`}
              className="flex flex-wrap items-center gap-2 text-sm"
            >
              <span className="font-mono text-xs text-foreground">{evt.tool}</span>
              <Label color={labelColorForStatus(evt.status)} isCompact>
                {evt.status}
              </Label>
            </li>
          ))}
        </ul>
      </ExpandableSection>
    </div>
  );
}
