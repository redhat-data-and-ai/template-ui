import { Button, Card, CardBody, CardHeader, CardTitle, ExpandableSection, TextInput } from '@patternfly/react-core';
import { MinusCircleIcon, PlusCircleIcon, TimesIcon } from '@patternfly/react-icons';
import { useState } from 'react';
import type { ToolCall, ToolCallArg } from './eval-dataset-types';

interface ToolCallEditorProps {
  /** Accessible prefix, e.g. "Turn 2 tool 1". */
  label: string;
  title: string;
  toolCall: ToolCall;
  canRemove: boolean;
  onChange: (patch: Partial<ToolCall>) => void;
  onRemove: () => void;
}

/** Card editing one expected tool call: its name and key/value argument rows. */
export function ToolCallEditor({ label, title, toolCall, canRemove, onChange, onRemove }: ToolCallEditorProps) {
  /** Immutably patches the argument at index ai. */
  function updateArg(ai: number, patch: Partial<ToolCallArg>) {
    onChange({ arguments: toolCall.arguments.map((a, i) => (i === ai ? { ...a, ...patch } : a)) });
  }

  return (
    <Card isCompact>
      <CardHeader
        actions={canRemove ? {
          actions: (
            <Button
              variant="plain"
              aria-label={`Remove ${label}`}
              icon={<TimesIcon />}
              onClick={onRemove}
            />
          ),
          hasNoOffset: true,
        } : undefined}
      >
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardBody>
        <div className="app-eval-form__stack">
          <div className="app-eval-form__mono">
            <TextInput
              type="text"
              aria-label={`${label} name`}
              value={toolCall.toolName}
              onChange={(_e, v) => onChange({ toolName: v })}
              placeholder="tool_name"
            />
          </div>
          <div className="app-eval-form__args">
            <span className="app-eval-form__summary">
              Arguments — leave value blank to match any value (<code>.*</code>), or enter a regex.
              Omit a key entirely to skip checking it.
            </span>
            {toolCall.arguments.map((arg, ai) => (
              <div key={ai} className="app-eval-form__arg">
                <TextInput
                  type="text"
                  aria-label={`${label} argument ${ai + 1} key`}
                  value={arg.key}
                  onChange={(_e, v) => updateArg(ai, { key: v })}
                  placeholder="key"
                />
                <TextInput
                  type="text"
                  aria-label={`${label} argument ${ai + 1} value`}
                  value={arg.value}
                  onChange={(_e, v) => updateArg(ai, { value: v })}
                  placeholder="value"
                />
                {toolCall.arguments.length > 1 && (
                  <Button
                    variant="plain"
                    aria-label={`Remove ${label} argument ${ai + 1}`}
                    icon={<MinusCircleIcon />}
                    onClick={() => onChange({ arguments: toolCall.arguments.filter((_, i) => i !== ai) })}
                  />
                )}
              </div>
            ))}
            <div>
              <Button
                variant="link"
                isInline
                icon={<PlusCircleIcon />}
                onClick={() => onChange({ arguments: [...toolCall.arguments, { key: '', value: '' }] })}
              >
                Add argument
              </Button>
            </div>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

interface KeywordsEditorProps {
  label: string;
  keywords: string[];
  onChange: (kw: string[]) => void;
}

/** Collapsible keyword editor: each row is one AND-group, rows are alternatives. */
export function KeywordsEditor({ label, keywords, onChange }: KeywordsEditorProps) {
  const [open, setOpen] = useState(false);
  const filled = keywords.filter(Boolean).length;
  const suffix = filled > 0 ? ` — ${filled} row${filled !== 1 ? 's' : ''}` : '';

  return (
    <ExpandableSection
      toggleText={`Expected keywords (optional)${suffix}`}
      isExpanded={open}
      onToggle={(_e, v) => setOpen(v)}
    >
      <div className="app-eval-form__args">
        <span className="app-eval-form__summary">
          Each row is one <strong>option</strong>. All keywords in a row must appear (AND within row). The first
          fully-matching row wins (OR across rows). To check <em>A AND (B or C)</em>, use two rows:{' '}
          <code>A, B</code> and <code>A, C</code>.
        </span>
        {keywords.map((row, ri) => (
          <div key={ri} className="app-eval-form__inline">
            <TextInput
              type="text"
              aria-label={`${label} keywords row ${ri + 1}`}
              value={row}
              onChange={(_e, v) => {
                const next = [...keywords];
                next[ri] = v;
                onChange(next);
              }}
              placeholder='e.g. "22.9, 22.8, 23.0" (OR within row)'
            />
            {keywords.length > 1 && (
              <Button
                variant="plain"
                aria-label={`Remove ${label} keywords row ${ri + 1}`}
                icon={<MinusCircleIcon />}
                onClick={() => onChange(keywords.filter((_, i) => i !== ri))}
              />
            )}
          </div>
        ))}
        <div>
          <Button
            variant="link"
            isInline
            icon={<PlusCircleIcon />}
            onClick={() => onChange([...keywords, ''])}
          >
            Add AND row
          </Button>
        </div>
      </div>
    </ExpandableSection>
  );
}
