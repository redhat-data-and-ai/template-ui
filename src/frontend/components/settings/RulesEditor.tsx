import { useEffect, useState } from 'react';
import { Button, Spinner } from '@patternfly/react-core';
import { Plus, Trash2, ScrollText, AlertCircle } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '../../redux/hooks';
import {
  addRule,
  removeRule,
  fetchRules,
  selectRules,
  selectPersonalizationLoading,
  selectPersonalizationError,
} from '../../redux/slices/personalization';

export function RulesEditor() {
  const dispatch = useAppDispatch();
  const rules = useAppSelector(selectRules);
  const loading = useAppSelector(selectPersonalizationLoading);
  const error = useAppSelector(selectPersonalizationError);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    dispatch(fetchRules());
  }, [dispatch]);

  const handleAdd = () => {
    const text = draft.trim();
    if (!text) return;
    dispatch(addRule(text));
    setDraft('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAdd();
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
        <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" aria-hidden="true" />
        <p className="text-xs text-amber-700 dark:text-amber-300">
          Custom rules shape how the agent responds. They apply to every conversation
          unless individually disabled.
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-3 p-3 rounded-lg bg-red-500/5 border border-red-500/20">
          <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
          <p className="text-xs text-red-400/80">{error}</p>
        </div>
      )}

      <div className="flex gap-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="e.g. Always respond in British English"
          aria-label="New rule"
          className="flex-1 rounded-xl px-3.5 py-2.5 text-sm resize-none min-h-[40px] border-0 bg-secondary/50 placeholder:opacity-60 focus:bg-card focus:outline-none focus:ring-0 focus:border-transparent focus:shadow-none"
          style={{ border: '1px solid var(--border)', boxShadow: 'none' }}
          rows={2}
        />
        <Button
          variant="primary"
          size="sm"
          isDisabled={!draft.trim()}
          onClick={handleAdd}
          className="self-end"
          icon={<Plus className="w-4 h-4" />}
        >
          Add
        </Button>
      </div>

      {loading ? (
        <div className="flex flex-col items-center py-8">
          <Spinner size="md" />
          <p className="text-sm text-muted-foreground/60 mt-2">Loading rules...</p>
        </div>
      ) : rules.length === 0 ? (
        <div className="flex flex-col items-center py-8 text-center">
          <ScrollText className="w-8 h-8 text-muted-foreground/30 mb-2" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">No custom rules</p>
          <p className="text-xs text-muted-foreground mt-1">
            Add instructions for the agent to follow
          </p>
        </div>
      ) : (
        <>
          <ul className="space-y-2">
            {rules.map((rule) => (
              <li
                key={rule.id}
                className="group flex items-start gap-3 p-3 rounded-lg border border-border bg-card hover:bg-secondary/30 transition-colors"
              >
                <ScrollText className="w-4 h-4 text-primary/60 mt-0.5 shrink-0" />
                <p className="flex-1 text-sm text-foreground leading-relaxed">{rule.content}</p>
                <button
                  onClick={() => dispatch(removeRule(rule.id))}
                  className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                  aria-label={`Remove rule: ${rule.content.substring(0, 50)}`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
