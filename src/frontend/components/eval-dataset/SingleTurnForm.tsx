import { useState } from 'react';
import { Plus, X, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Turn, ToolCall, ToolCallArg, CaseTag } from './eval-dataset-types';
import { emptyToolCall, normTurn } from './eval-dataset-utils';

interface SingleTurnFormProps {
  name: string;
  tag: CaseTag;
  turn: Turn;
  description: string;
  onNameChange: (v: string) => void;
  onTagChange: (v: CaseTag) => void;
  onTurnChange: (t: Turn) => void;
  onDescriptionChange: (v: string) => void;
}


/** Form for editing a single-turn test case with tag selection, keywords, and optional tool-call expectations. */
export function SingleTurnForm({
  name,
  tag,
  turn,
  description,
  onNameChange,
  onTagChange,
  onTurnChange,
  onDescriptionChange,
}: SingleTurnFormProps) {
  const [keywordsExpanded, setKeywordsExpanded] = useState(false);

  const isHitl = tag === 'hitl';
  const safeTurn = normTurn(turn);

  /** Merges a partial update into the current turn and propagates via onTurnChange. */
  function updateTurn(patch: Partial<Turn>) {
    onTurnChange({ ...safeTurn, ...patch });
  }

  /** Appends a new empty tool call to the current turn. */
  function addToolCall() {
    updateTurn({ expectedToolCalls: [...safeTurn.expectedToolCalls, emptyToolCall()] });
  }

  /** Removes the tool call at the given index from the current turn. */
  function removeToolCall(i: number) {
    updateTurn({ expectedToolCalls: safeTurn.expectedToolCalls.filter((_, idx) => idx !== i) });
  }

  /** Immutably patches the tool call at the given index. */
  function updateToolCall(i: number, patch: Partial<ToolCall>) {
    const calls = safeTurn.expectedToolCalls.map((tc, idx) => idx === i ? { ...tc, ...patch } : tc);
    updateTurn({ expectedToolCalls: calls });
  }

  /** Appends a new empty argument row to the tool call at the given index. */
  function addArg(toolIdx: number) {
    updateToolCall(toolIdx, {
      arguments: [...safeTurn.expectedToolCalls[toolIdx].arguments, { key: '', value: '' }],
    });
  }

  /** Removes the argument at argIdx from the tool call at toolIdx. */
  function removeArg(toolIdx: number, argIdx: number) {
    updateToolCall(toolIdx, {
      arguments: safeTurn.expectedToolCalls[toolIdx].arguments.filter((_, i) => i !== argIdx),
    });
  }

  /** Immutably patches the argument at argIdx within the tool call at toolIdx. */
  function updateArg(toolIdx: number, argIdx: number, patch: Partial<ToolCallArg>) {
    const args = safeTurn.expectedToolCalls[toolIdx].arguments.map((a, i) =>
      i === argIdx ? { ...a, ...patch } : a,
    );
    updateToolCall(toolIdx, { arguments: args });
  }

  return (
    <div className="space-y-5">
      {/* Name */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground">
          Test Case Name <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="e.g. calculate_bmi_standard"
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        <p className="text-xs text-muted-foreground">Use lowercase letters and underscores only</p>
      </div>

      {/* Description */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground">
          Description <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
          placeholder="Brief description of what this test case validates"
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>

      {/* Tag */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground">
          Tag <span className="text-red-500">*</span>
        </label>
        <div className="grid grid-cols-2 gap-3">
          {([
            { value: 'non_hitl' as CaseTag, label: 'Non-HITL', desc: 'Automated evaluation, no human approval' },
            { value: 'hitl' as CaseTag, label: 'HITL approval', desc: 'Requires human-in-the-loop approval step' },
          ] as { value: CaseTag; label: string; desc: string }[]).map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onTagChange(opt.value)}
              className={cn(
                'text-left rounded-lg border-2 px-4 py-3 transition-colors',
                tag === opt.value
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-muted-foreground/40',
              )}
            >
              <p className="text-sm font-medium text-foreground">{opt.label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{opt.desc}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Query */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground">
          What does the user ask? <span className="text-red-500">*</span>
        </label>
        <textarea
          value={safeTurn.userMessage}
          onChange={(e) => updateTurn({ userMessage: e.target.value })}
          rows={3}
          placeholder="Enter the user's question or request…"
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30 resize-y"
        />
      </div>

      {/* Expected response */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground">
          What should the agent respond with? <span className="text-red-500">*</span>
        </label>
        <textarea
          value={safeTurn.expectedResponse}
          onChange={(e) => updateTurn({ expectedResponse: e.target.value })}
          rows={3}
          placeholder="Describe the ideal agent response…"
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30 resize-y"
        />
      </div>

      {/* Non-HITL optional fields */}
      {!isHitl && (
        <>
          {/* User intent */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">What is the user trying to accomplish?</label>
            <p className="text-xs text-muted-foreground">Optional. Describes the underlying goal for intent evaluation.</p>
            <textarea
              value={safeTurn.expectedIntent}
              onChange={(e) => updateTurn({ expectedIntent: e.target.value })}
              rows={2}
              placeholder="e.g. User wants to calculate their BMI to assess health status"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30 resize-y"
            />
          </div>

          {/* Expected keywords */}
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setKeywordsExpanded((v) => !v)}
              className="flex items-center gap-2 text-sm font-medium text-foreground hover:text-primary transition-colors"
            >
              {keywordsExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              Expected keywords
              <span className="text-xs font-normal text-muted-foreground">(optional)</span>
              {safeTurn.expectedKeywords.filter(Boolean).length > 0 && (
                <span className="text-xs font-medium text-primary">
                  {safeTurn.expectedKeywords.filter(Boolean).length} row{safeTurn.expectedKeywords.filter(Boolean).length !== 1 ? 's' : ''}
                </span>
              )}
            </button>

            {keywordsExpanded && (
              <div className="space-y-2 pl-2 border-l-2 border-border">
                <p className="text-xs text-muted-foreground">
                  Each row is one <strong>option</strong>. All keywords in a row must appear (AND within row). The first fully-matching row wins (OR across rows).
                </p>
                <p className="text-xs text-muted-foreground/70">
                  To check <em>A AND (B or C)</em>, use two rows: <code className="font-mono">A, B</code> and <code className="font-mono">A, C</code>.
                </p>
                {safeTurn.expectedKeywords.map((row, ri) => (
                  <div key={ri} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={row}
                      onChange={(e) => {
                        const next = [...safeTurn.expectedKeywords];
                        next[ri] = e.target.value;
                        updateTurn({ expectedKeywords: next });
                      }}
                      placeholder='e.g. "22.9, 22.8, 23.0" (OR within row)'
                      className="flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                    {safeTurn.expectedKeywords.length > 1 && (
                      <button
                        type="button"
                        onClick={() => updateTurn({ expectedKeywords: safeTurn.expectedKeywords.filter((_, i) => i !== ri) })}
                        className="text-muted-foreground hover:text-red-500"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => updateTurn({ expectedKeywords: [...safeTurn.expectedKeywords, ''] })}
                  className="text-xs text-primary hover:underline flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" /> Add AND row
                </button>
              </div>
            )}
          </div>

          {/* Expected tool calls (Actions) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium text-foreground">Expected tool calls <span className="text-muted-foreground font-normal">(Actions)</span></label>
                <p className="text-xs text-muted-foreground">Optional. Define which tools the agent should call.</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer gap-2">
                <input
                  type="checkbox"
                  checked={safeTurn.toolCallEnabled}
                  onChange={(e) => {
                    updateTurn({
                      toolCallEnabled: e.target.checked,
                      expectedToolCalls: e.target.checked && safeTurn.expectedToolCalls.length === 0
                        ? [emptyToolCall()]
                        : safeTurn.expectedToolCalls,
                    });
                  }}
                  className="sr-only"
                />
                <div className={cn(
                  'w-9 h-5 rounded-full transition-colors',
                  safeTurn.toolCallEnabled ? 'bg-primary' : 'bg-border',
                )}>
                  <div className={cn(
                    'w-3.5 h-3.5 rounded-full bg-white shadow transition-transform mt-0.5 mx-0.5',
                    safeTurn.toolCallEnabled ? 'translate-x-4' : 'translate-x-0',
                  )} />
                </div>
                <span className="text-sm text-muted-foreground">
                  {safeTurn.toolCallEnabled ? 'ON' : 'OFF'}
                </span>
              </label>
            </div>

            {safeTurn.toolCallEnabled && (
              <div className="space-y-3">
                {/* Ordered toggle */}
                <label className="flex items-center gap-2 cursor-pointer text-sm text-muted-foreground select-none">
                  <input
                    type="checkbox"
                    checked={safeTurn.toolCallOrdered}
                    onChange={(e) => updateTurn({ toolCallOrdered: e.target.checked })}
                    className="w-4 h-4 accent-primary cursor-pointer"
                  />
                  Tool calls must be in exact order
                  <span className="text-muted-foreground/60 text-xs">(default: any order)</span>
                </label>

                {safeTurn.expectedToolCalls.map((tc, ti) => (
                  <div key={ti} className="rounded-lg border border-border bg-secondary/20 p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Tool {ti + 1}
                      </span>
                      {safeTurn.expectedToolCalls.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeToolCall(ti)}
                          className="ml-auto text-muted-foreground hover:text-red-500"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    <input
                      type="text"
                      value={tc.toolName}
                      onChange={(e) => updateToolCall(ti, { toolName: e.target.value })}
                      placeholder="tool_name"
                      className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm font-mono placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                    <div className="space-y-1.5">
                      <p className="text-xs text-muted-foreground">
                        Arguments{' '}
                        <span className="text-muted-foreground/60">— leave value blank to match any value (<code className="font-mono">.*</code>), or enter a regex. Omit a key entirely to skip checking it.</span>
                      </p>
                      {tc.arguments.map((arg, ai) => (
                        <div key={ai} className="flex items-center gap-2">
                          <input
                            type="text"
                            value={arg.key}
                            onChange={(e) => updateArg(ti, ai, { key: e.target.value })}
                            placeholder="key"
                            className="w-32 rounded-md border border-border bg-background px-2 py-1 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-primary/30"
                          />
                          <span className="text-muted-foreground text-xs">:</span>
                          <input
                            type="text"
                            value={arg.value}
                            onChange={(e) => updateArg(ti, ai, { value: e.target.value })}
                            placeholder="value"
                            className="flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-primary/30"
                          />
                          {tc.arguments.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeArg(ti, ai)}
                              className="text-muted-foreground hover:text-red-500"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => addArg(ti)}
                        className="text-xs text-primary hover:underline flex items-center gap-1"
                      >
                        <Plus className="w-3 h-3" /> Add argument
                      </button>
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addToolCall}
                  className="w-full rounded-lg border border-dashed border-border py-2 text-sm text-muted-foreground hover:border-primary hover:text-primary transition-colors flex items-center justify-center gap-2"
                >
                  <Plus className="w-4 h-4" /> Add tool call
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

