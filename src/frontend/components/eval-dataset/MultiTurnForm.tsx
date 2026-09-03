import { Plus, X, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import type { Turn, ToolCall, ToolCallArg } from './eval-dataset-types';
import { emptyToolCall, emptyTurn, normTurn } from './eval-dataset-utils';

interface MultiTurnFormProps {
  name: string;
  turns: Turn[];
  description: string;
  onNameChange: (v: string) => void;
  onTurnsChange: (turns: Turn[]) => void;
  onDescriptionChange: (v: string) => void;
}


/** Form for editing a multi-turn test case with per-turn user message, expected response, keywords, and tool calls. */
export function MultiTurnForm({ name, turns, description, onNameChange, onTurnsChange, onDescriptionChange }: MultiTurnFormProps) {
  const safeTurns = turns.map(normTurn);
  const toolCallTotal = safeTurns.reduce((sum, t) => sum + (t.toolCallEnabled ? Math.max(1, t.expectedToolCalls.length) : 0), 0);

  /** Immutably patches a single turn at the given index and propagates via onTurnsChange. */
  function updateTurn(idx: number, patch: Partial<Turn>) {
    onTurnsChange(turns.map((t, i) => i === idx ? { ...t, ...patch } : t));
  }

  /** Removes the turn at the given index from the turns array. */
  function removeTurn(idx: number) {
    onTurnsChange(turns.filter((_, i) => i !== idx));
  }

  /** Appends a new empty turn to the turns array. */
  function addTurn() {
    onTurnsChange([...turns, emptyTurn()]);
  }

  /** Appends a new empty tool call to the turn at index ti. */
  function addToolCall(ti: number) {
    const t = turns[ti];
    updateTurn(ti, { expectedToolCalls: [...t.expectedToolCalls, emptyToolCall()] });
  }

  /** Removes the tool call at index ci from the turn at index ti. */
  function removeToolCall(ti: number, ci: number) {
    updateTurn(ti, { expectedToolCalls: turns[ti].expectedToolCalls.filter((_, i) => i !== ci) });
  }

  /** Immutably patches the tool call at index ci within turn ti. */
  function updateToolCall(ti: number, ci: number, patch: Partial<ToolCall>) {
    updateTurn(ti, {
      expectedToolCalls: turns[ti].expectedToolCalls.map((tc, i) => i === ci ? { ...tc, ...patch } : tc),
    });
  }

  /** Appends a new empty argument row to the tool call at (ti, ci). */
  function addArg(ti: number, ci: number) {
    updateToolCall(ti, ci, {
      arguments: [...turns[ti].expectedToolCalls[ci].arguments, { key: '', value: '' }],
    });
  }

  /** Removes the argument at index ai from the tool call at (ti, ci). */
  function removeArg(ti: number, ci: number, ai: number) {
    updateToolCall(ti, ci, {
      arguments: turns[ti].expectedToolCalls[ci].arguments.filter((_, i) => i !== ai),
    });
  }

  /** Immutably patches the argument at index ai within the tool call at (ti, ci). */
  function updateArg(ti: number, ci: number, ai: number, patch: Partial<ToolCallArg>) {
    updateToolCall(ti, ci, {
      arguments: turns[ti].expectedToolCalls[ci].arguments.map((a, i) => i === ai ? { ...a, ...patch } : a),
    });
  }

  return (
    <div className="space-y-5">
      {/* Name */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground">
          Test Case Name <span className="text-red-500">*</span>
        </label>
        <div className="flex items-center gap-3">
          <input
            type="text"
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="e.g. multi_turn_onboarding_flow"
            className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm font-mono placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <span className="shrink-0 rounded-full px-2.5 py-1 text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">
            multi_turn
          </span>
        </div>
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
          placeholder="Brief description of this multi-turn scenario"
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>

      {/* Turn cards */}
      <div className="space-y-3">
        {safeTurns.map((turn, ti) => (
          <div key={turn.id} className="rounded-lg border border-border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Turn {ti + 1}
              </span>
              {ti > 0 && (
                <button
                  type="button"
                  onClick={() => removeTurn(ti)}
                  className="text-muted-foreground hover:text-red-500 transition-colors"
                  title="Remove turn"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">
                User says <span className="text-red-500">*</span>
              </label>
              <textarea
                value={turn.userMessage}
                onChange={(e) => updateTurn(ti, { userMessage: e.target.value })}
                rows={2}
                placeholder="What the user says in this turn…"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30 resize-y"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">
                Agent should respond <span className="text-red-500">*</span>
              </label>
              <textarea
                value={turn.expectedResponse}
                onChange={(e) => updateTurn(ti, { expectedResponse: e.target.value })}
                rows={2}
                placeholder="What the agent should respond with…"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30 resize-y"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">User intent</label>
              <input
                type="text"
                value={turn.expectedIntent}
                onChange={(e) => updateTurn(ti, { expectedIntent: e.target.value })}
                placeholder="Optional: what is the user trying to accomplish in this turn?"
                className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>

            {/* Expected keywords */}
            <TurnKeywords
              keywords={turn.expectedKeywords ?? ['']}
              onChange={(kw) => updateTurn(ti, { expectedKeywords: kw })}
            />

            {/* Tool call toggle */}
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-xs text-muted-foreground">This turn expects a tool call <span className="text-muted-foreground/60">(Action)</span></span>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={turn.toolCallEnabled}
                  onChange={(e) => {
                    updateTurn(ti, {
                      toolCallEnabled: e.target.checked,
                      expectedToolCalls: e.target.checked && turn.expectedToolCalls.length === 0
                        ? [emptyToolCall()]
                        : turn.expectedToolCalls,
                    });
                  }}
                  className="sr-only"
                />
                <div className={cn(
                  'w-8 h-4.5 rounded-full transition-colors',
                  turn.toolCallEnabled ? 'bg-primary' : 'bg-border',
                )}>
                  <div className={cn(
                    'w-3 h-3 rounded-full bg-white shadow transition-transform mt-0.5 mx-0.5',
                    turn.toolCallEnabled ? 'translate-x-3.5' : 'translate-x-0',
                  )} />
                </div>
              </label>
            </div>

            {/* Tool call cards */}
            {turn.toolCallEnabled && (
              <div className="space-y-2 pl-3 border-l-2 border-primary/20">
                <label className="flex items-center gap-2 cursor-pointer text-xs text-muted-foreground select-none">
                  <input
                    type="checkbox"
                    checked={turn.toolCallOrdered}
                    onChange={(e) => updateTurn(ti, { toolCallOrdered: e.target.checked })}
                    className="w-3.5 h-3.5 accent-primary cursor-pointer"
                  />
                  Must be called in exact order
                  <span className="text-muted-foreground/60">(default: any order)</span>
                </label>
                {turn.expectedToolCalls.map((tc, ci) => (
                  <div key={ci} className="rounded-md border border-border bg-secondary/20 p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Tool name</span>
                      {turn.expectedToolCalls.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeToolCall(ti, ci)}
                          className="ml-auto text-muted-foreground hover:text-red-500"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                    <input
                      type="text"
                      value={tc.toolName}
                      onChange={(e) => updateToolCall(ti, ci, { toolName: e.target.value })}
                      placeholder="tool_name"
                      className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                    <div className="space-y-1">
                      {tc.arguments.map((arg, ai) => (
                        <div key={ai} className="flex items-center gap-1.5">
                          <input
                            type="text"
                            value={arg.key}
                            onChange={(e) => updateArg(ti, ci, ai, { key: e.target.value })}
                            placeholder="key"
                            className="w-24 rounded border border-border bg-background px-2 py-1 text-xs font-mono focus:outline-none"
                          />
                          <span className="text-muted-foreground text-xs">:</span>
                          <input
                            type="text"
                            value={arg.value}
                            onChange={(e) => updateArg(ti, ci, ai, { value: e.target.value })}
                            placeholder="value"
                            className="flex-1 rounded border border-border bg-background px-2 py-1 text-xs font-mono focus:outline-none"
                          />
                          {tc.arguments.length > 1 && (
                            <button type="button" onClick={() => removeArg(ti, ci, ai)} className="text-muted-foreground hover:text-red-500">
                              <X className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => addArg(ti, ci)}
                        className="text-xs text-primary hover:underline flex items-center gap-0.5 mt-1"
                      >
                        <Plus className="w-3 h-3" /> arg
                      </button>
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => addToolCall(ti)}
                  className="text-xs text-primary hover:underline flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" /> Add tool call
                </button>
              </div>
            )}
          </div>
        ))}

        <button
          type="button"
          onClick={addTurn}
          className="w-full rounded-lg border-2 border-dashed border-border py-3 text-sm text-muted-foreground hover:border-primary hover:text-primary transition-colors flex items-center justify-center gap-2"
        >
          <Plus className="w-4 h-4" /> Add another turn
        </button>
      </div>

      {/* Live footer summary */}
      <div className="rounded-lg bg-secondary/30 border border-border px-4 py-2.5 text-xs text-muted-foreground flex items-center gap-3">
        <span>{turns.length} turn{turns.length !== 1 ? 's' : ''}</span>
        <span>·</span>
        <span>tag: <span className="font-medium text-foreground">multi_turn</span></span>
        {toolCallTotal > 0 && (
          <>
            <span>·</span>
            <span>{toolCallTotal} tool call{toolCallTotal !== 1 ? 's' : ''} expected</span>
          </>
        )}
      </div>
    </div>
  );
}

/** Collapsible keyword editor for a single turn, supporting multiple AND-row entries. */
function TurnKeywords({ keywords, onChange }: { keywords: string[]; onChange: (kw: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const filled = keywords.filter(Boolean);

  return (
    <div className="space-y-1.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-xs font-medium text-foreground hover:text-primary transition-colors"
      >
        {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        Expected keywords
        {filled.length > 0 && (
          <span className="text-primary font-semibold">{filled.length} row{filled.length !== 1 ? 's' : ''}</span>
        )}
        <span className="font-normal text-muted-foreground/60">(optional)</span>
      </button>

      {open && (
        <div className="space-y-1.5 pl-2 border-l-2 border-border">
          <p className="text-[10px] text-muted-foreground">Each row = one option (all keywords in row must match). First matching row = PASS.</p>
          {keywords.map((row, ri) => (
            <div key={ri} className="flex items-center gap-1.5">
              <input
                type="text"
                value={row}
                onChange={(e) => {
                  const next = [...keywords];
                  next[ri] = e.target.value;
                  onChange(next);
                }}
                placeholder='e.g. "Normal, 22.9"'
                className="flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              {keywords.length > 1 && (
                <button
                  type="button"
                  onClick={() => onChange(keywords.filter((_, i) => i !== ri))}
                  className="text-muted-foreground hover:text-red-500"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={() => onChange([...keywords, ''])}
            className="text-[11px] text-primary hover:underline flex items-center gap-1"
          >
            <Plus className="w-3 h-3" /> Add row
          </button>
        </div>
      )}
    </div>
  );
}
