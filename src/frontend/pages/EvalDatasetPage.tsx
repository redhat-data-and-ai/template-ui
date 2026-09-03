import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Search, Database, Loader2, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { buildAgentApiUrl } from '@/lib/app-paths';
import type { TestCase, CaseTag } from '../components/eval-dataset/eval-dataset-types';
import { EvalDatasetTable } from '../components/eval-dataset/EvalDatasetTable';
import { AddTestCaseModal } from '../components/eval-dataset/AddTestCaseModal';

interface AgentModel {
  model: string;
  source: string;
  default: boolean;
}

const TAG_OPTIONS: { value: CaseTag | 'all'; label: string }[] = [
  { value: 'all', label: 'All tags' },
  { value: 'non_hitl', label: 'non_hitl' },
  { value: 'hitl', label: 'hitl' },
  { value: 'multi_turn', label: 'multi_turn' },
];

/** Full-page view for managing the eval dataset with search, tag filtering, CRUD operations, and model selection. */
export function EvalDatasetPage() {
  const navigate = useNavigate();
  const [cases, setCases] = useState<TestCase[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCase, setEditingCase] = useState<TestCase | undefined>();
  const [search, setSearch] = useState('');
  const [tagFilter, setTagFilter] = useState<CaseTag | 'all'>('all');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [availableModels, setAvailableModels] = useState<AgentModel[]>([]);
  const [judgeModel, setJudgeModel] = useState<string>('');
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());

  const loadDataset = useCallback(async () => {
    setLoading(true);
    try {
      const [datasetRes, modelsRes] = await Promise.all([
        fetch(buildAgentApiUrl('/evals/dataset'), { credentials: 'same-origin' }),
        fetch(buildAgentApiUrl('/evals/models'), { credentials: 'same-origin' }),
      ]);

      if (modelsRes.ok) {
        const modelsData = await modelsRes.json();
        const models: AgentModel[] = modelsData.models ?? [];
        setAvailableModels(models);
        const defaultModel = models.find((m) => m.default)?.model ?? models[0]?.model ?? '';
        if (datasetRes.ok) {
          const data = await datasetRes.json();
          setCases((data.dataset?.cases as TestCase[]) ?? []);
          setJudgeModel((data.judge_model as string | null) ?? defaultModel);
        } else {
          setJudgeModel(defaultModel);
          setLoadError(`Failed to load dataset (${datasetRes.status}) — check your session and try again.`);
        }
      } else if (datasetRes.ok) {
        const data = await datasetRes.json();
        setCases((data.dataset?.cases as TestCase[]) ?? []);
        setJudgeModel(data.judge_model ?? '');
      } else {
        setLoadError(`Failed to load dataset (${datasetRes.status}) — check your session and try again.`);
      }
    } catch {
      setLoadError('Could not load dataset — check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDataset();
  }, [loadDataset]);

  const filtered = useMemo(() => {
    return cases.filter((tc) => {
      const matchesTag = tagFilter === 'all' || tc.tag === tagFilter;
      const q = search.toLowerCase();
      const matchesSearch = !q || tc.name.toLowerCase().includes(q) || tc.description?.toLowerCase().includes(q);
      return matchesTag && matchesSearch;
    });
  }, [cases, search, tagFilter]);

  /** Persists the current test cases and judge model to the agent backend. */
  async function handleSaveDataset() {
    const doSave = async () => {
      setSaving(true);
      setSaveError('');
      setSaveSuccess(false);
      try {
        const res = await fetch(buildAgentApiUrl('/evals/dataset'), {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cases, judge_model: judgeModel || null }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          setSaveError((err as { detail?: string }).detail ?? `Error ${res.status}`);
        } else {
          setSaveSuccess(true);
          setTimeout(() => setSaveSuccess(false), 3000);
        }
      } catch {
        setSaveError('Network error — could not reach the agent backend.');
      } finally {
        setSaving(false);
      }
    };
    saveQueueRef.current = saveQueueRef.current.then(doSave, doSave);
    return saveQueueRef.current;
  }

  /** Upserts a test case into the local cases array and closes the modal. */
  function handleSave(tc: TestCase) {
    setCases((prev) => {
      const idx = prev.findIndex((c) => c.id === tc.id);
      if (idx >= 0) return prev.map((c) => c.id === tc.id ? tc : c);
      return [...prev, tc];
    });
    setModalOpen(false);
    setEditingCase(undefined);
  }

  /** Opens the modal pre-populated with the test case matching the given id. */
  function handleEdit(id: string) {
    setEditingCase(cases.find((c) => c.id === id));
    setModalOpen(true);
  }

  /** Optimistically removes a test case and syncs the deletion to the backend. */
  async function handleDelete(id: string) {
    const deletedCase = cases.find((c) => c.id === id);
    const updated = cases.filter((c) => c.id !== id);
    setCases(updated);
    const restoreAndSync = () => {
      if (!deletedCase) return;
      let restored: TestCase[] = [];
      setCases((cur) => {
        restored = cur.some((c) => c.id === id) ? cur : [...cur, deletedCase];
        return restored;
      });
      const doSync = async () => {
        try {
          await fetch(buildAgentApiUrl('/evals/dataset'), {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cases: restored, judge_model: judgeModel || null }),
          });
        } catch { /* best-effort sync */ }
      };
      saveQueueRef.current = saveQueueRef.current.then(doSync, doSync);
    };
    const doDelete = async () => {
      try {
        const res = await fetch(buildAgentApiUrl('/evals/dataset'), {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cases: updated, judge_model: judgeModel || null }),
        });
        if (!res.ok) {
          restoreAndSync();
          const err = await res.json().catch(() => ({}));
          setSaveError((err as { detail?: string }).detail ?? `Delete failed (${res.status})`);
        }
      } catch {
        restoreAndSync();
        setSaveError('Network error — could not delete test case.');
      }
    };
    saveQueueRef.current = saveQueueRef.current.then(doDelete, doDelete);
    return saveQueueRef.current;
  }


  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-background">
      {/* Top bar */}
      <div className="shrink-0 border-b border-border bg-card/60 backdrop-blur-sm px-6 py-3">
        <div className="max-w-6xl mx-auto flex items-center gap-3">
          <button
            onClick={() => navigate('/settings?tab=developer')}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
            aria-label="Back to settings"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <Database className="w-4 h-4 text-muted-foreground" />
          <h1 className="text-lg font-semibold text-foreground">Eval Dataset</h1>

          {/* Judge model selector */}
          {!loading && availableModels.length > 0 && (
            <div className="ml-4 flex items-center gap-2">
              <span className="text-xs text-muted-foreground shrink-0">Judge model</span>
              <div className="relative">
                <select
                  value={judgeModel}
                  onChange={(e) => setJudgeModel(e.target.value)}
                  className="appearance-none rounded-md border border-border bg-background pl-3 pr-7 py-1 text-xs text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-primary/30 cursor-pointer"
                >
                  {availableModels.map((m) => (
                    <option key={m.model} value={m.model}>
                      {m.model}{m.default ? ' (orchestrator)' : ` (${m.source.replace('subagent:', '')})`}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
              </div>
            </div>
          )}

          {!loading && (
            <span className="ml-auto text-xs text-muted-foreground">
              {cases.length} test case{cases.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-6 py-6 space-y-4">

          {loading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              <span className="text-sm">Loading dataset…</span>
            </div>
          ) : loadError ? (
            <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-800 px-4 py-8 text-center">
              <p className="text-sm text-red-600 dark:text-red-400">{loadError}</p>
              <button
                onClick={() => { setLoadError(''); void loadDataset(); }}
                className="mt-3 text-xs text-red-600 dark:text-red-400 underline"
              >
                Retry
              </button>
            </div>
          ) : (
            <>
              {/* Toolbar */}
              <div className="flex items-center gap-3 flex-wrap">
                <div className="relative flex-1 min-w-48">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search test cases…"
                    className="w-full pr-3 py-2 rounded-md border border-border bg-background text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30"
                    style={{ paddingLeft: '2.5rem' }}
                  />
                </div>

                <select
                  value={tagFilter}
                  onChange={(e) => setTagFilter(e.target.value as CaseTag | 'all')}
                  className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  {TAG_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>

                <button
                  onClick={() => { setEditingCase(undefined); setModalOpen(true); }}
                  className="flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-sm font-medium text-white hover:bg-primary/90 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Add Test Case
                </button>
              </div>

              {/* Table */}
              <EvalDatasetTable
                cases={filtered}
                onEdit={handleEdit}
                onDelete={handleDelete}
              />

              {/* Footer */}
              {cases.length > 0 && (
                <div className="flex items-center justify-between pt-2">
                  <p className="text-xs text-muted-foreground">
                    {filtered.length !== cases.length
                      ? `Showing ${filtered.length} of ${cases.length} cases`
                      : `${cases.length} test case${cases.length !== 1 ? 's' : ''} in dataset`}
                  </p>
                  <div className="flex items-center gap-3">
                    {saveError && (
                      <p className="text-xs text-red-600">{saveError}</p>
                    )}
                    {saveSuccess && (
                      <p className="text-xs text-emerald-600">Dataset saved.</p>
                    )}
                    <button
                      onClick={handleSaveDataset}
                      disabled={saving}
                      className={cn(
                        'flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium text-white transition-colors',
                        saving ? 'bg-primary/60 cursor-not-allowed' : 'bg-primary hover:bg-primary/90',
                      )}
                    >
                      {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      {saving ? 'Saving…' : 'Save Dataset'}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {modalOpen && (
        <AddTestCaseModal
          initialCase={editingCase}
          onSave={handleSave}
          onClose={() => { setModalOpen(false); setEditingCase(undefined); }}
        />
      )}
    </div>
  );
}
