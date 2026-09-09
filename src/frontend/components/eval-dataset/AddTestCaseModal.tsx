import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TestCase, Turn, CaseTag } from './eval-dataset-types';
import { emptyTurn } from './eval-dataset-utils';
import { SingleTurnForm } from './SingleTurnForm';
import { MultiTurnForm } from './MultiTurnForm';

interface AddTestCaseModalProps {
  initialCase?: TestCase;
  onSave: (tc: TestCase) => void;
  onClose: () => void;
}

type Mode = 'single' | 'multi';


const MULTI_TAGS: CaseTag[] = ['multi_turn'];

/** Determines whether a test case is single-turn or multi-turn based on its tag. */
function modeFromCase(tc: TestCase): Mode {
  return MULTI_TAGS.includes(tc.tag) ? 'multi' : 'single';
}

/** Modal dialog for creating or editing a test case with single-turn and multi-turn modes. */
export function AddTestCaseModal({ initialCase, onSave, onClose }: AddTestCaseModalProps) {
  const isEditing = Boolean(initialCase);
  const [mode, setMode] = useState<Mode>(initialCase ? modeFromCase(initialCase) : 'single');
  const [name, setName] = useState(initialCase?.name ?? '');
  const [description, setDescription] = useState(initialCase?.description ?? '');
  const [tag, setTag] = useState<CaseTag>(initialCase?.tag ?? 'non_hitl');
  const [singleTurn, setSingleTurn] = useState<Turn>(
    initialCase && !MULTI_TAGS.includes(initialCase.tag) ? initialCase.turns[0] ?? emptyTurn() : emptyTurn(),
  );
  const [multiTurns, setMultiTurns] = useState<Turn[]>(
    initialCase && MULTI_TAGS.includes(initialCase.tag) ? initialCase.turns : [emptyTurn()],
  );
  const [error, setError] = useState('');

  // Sync tag when mode changes — functional updater avoids closing over stale tag
  useEffect(() => {
    setTag((prev) => {
      if (mode === 'multi' && !MULTI_TAGS.includes(prev)) return 'multi_turn';
      if (mode === 'single' && MULTI_TAGS.includes(prev)) return 'non_hitl';
      return prev;
    });
  }, [mode]);

  /** Validates inputs, strips empty tool-call noise, and invokes onSave with the assembled TestCase. */
  function handleSave() {
    setError('');
    if (!name.trim()) { setError('Test Case Name is required.'); return; }
    if (!/^[a-z0-9_]+$/.test(name.trim())) {
      setError('Name must contain only lowercase letters, digits, and underscores.');
      return;
    }
    if (!description.trim()) { setError('Description is required.'); return; }

    const turns = mode === 'multi' ? multiTurns : [singleTurn];
    const hasEmptyTurn = turns.some((t) => !t.userMessage.trim() || !t.expectedResponse.trim());
    if (hasEmptyTurn) {
      setError('Each turn requires a user message and expected response.');
      return;
    }

    // Strip empty argument rows and empty tool calls before saving so
    // Postgres doesn't store [{key:"", value:""}] noise.
    const cleanedTurns = turns.map((t) => ({
      ...t,
      expectedToolCalls: t.toolCallEnabled
        ? t.expectedToolCalls
            .map((tc) => ({
              ...tc,
              arguments: tc.arguments.filter((a) => a.key.trim() !== ''),
            }))
            .filter((tc) => tc.toolName.trim() !== '')
        : [],
    }));

    const saved: TestCase = {
      id: initialCase?.id ?? crypto.randomUUID(),
      name: name.trim(),
      description: description.trim(),
      tag,
      turns: cleanedTurns,
      createdAt: initialCase?.createdAt ?? new Date().toISOString(),
    };
    onSave(saved);
  }

  /** Switches between single and multi-turn mode, skipping if already in the requested mode. */
  function handleModeSwitch(next: Mode) {
    if (next === mode) return;
    setMode(next);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-8"
      data-testid="test-case-modal-backdrop"
    >
      <div className="relative w-full max-w-2xl max-h-[calc(100vh-4rem)] flex flex-col rounded-xl border border-border bg-background shadow-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5 shrink-0">
          <h2 className="text-base font-semibold text-foreground">
            {isEditing ? 'Edit Test Case' : 'Add Test Case'}
          </h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Mode toggle */}
        {!isEditing && (
          <div className="shrink-0 border-b border-border px-5 py-3">
            <div className="inline-flex rounded-lg border border-border bg-secondary/30 p-0.5">
              {(['single', 'multi'] as Mode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => handleModeSwitch(m)}
                  className={cn(
                    'px-4 py-1.5 rounded-md text-sm font-medium transition-colors',
                    mode === m
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {m === 'single' ? 'Single turn' : 'Multi-turn conversation'}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto p-5">
          {mode === 'single' ? (
            <SingleTurnForm
              name={name}
              tag={tag}
              turn={singleTurn}
              description={description}
              onNameChange={setName}
              onTagChange={setTag}
              onTurnChange={setSingleTurn}
              onDescriptionChange={setDescription}
            />
          ) : (
            <MultiTurnForm
              name={name}
              turns={multiTurns}
              description={description}
              onNameChange={setName}
              onTurnsChange={setMultiTurns}
              onDescriptionChange={setDescription}
            />
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-border px-5 py-3.5 flex items-center justify-between">
          <div>
            {error && <p className="text-xs text-red-600">{error}</p>}
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-md border border-border text-sm text-muted-foreground hover:text-foreground hover:border-muted-foreground transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-4 py-2 rounded-md bg-primary text-sm font-medium text-white hover:bg-primary/90 transition-colors"
            >
              {isEditing ? 'Update Test Case' : 'Save Test Case'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
