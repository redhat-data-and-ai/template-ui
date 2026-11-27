import { useState, useEffect, useMemo, useCallback, useRef, type Ref } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  AlertActionLink,
  Button,
  Card,
  FormSelect,
  FormSelectOption,
  MenuToggle,
  type MenuToggleElement,
  SearchInput,
  Select,
  SelectList,
  SelectOption,
  Spinner,
  Title,
  Toolbar,
  ToolbarContent,
  ToolbarItem,
} from '@patternfly/react-core';
import { ArrowLeftIcon, PlusCircleIcon } from '@patternfly/react-icons';
import { buildAgentApiUrl } from '@/lib/app-paths';
import type { TestCase, CaseTag } from '../components/eval-dataset/eval-dataset-types';
import { EvalDatasetTable } from '../components/eval-dataset/EvalDatasetTable';
import { AddTestCaseModal } from '../components/eval-dataset/AddTestCaseModal';
import '../components/eval-dataset/eval-dataset.css';

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
  const [tagMenuOpen, setTagMenuOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');
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

  /** Persists the given test cases and judge model to the agent backend. */
  function saveDataset(casesToSave: TestCase[], model: string) {
    const doSave = async () => {
      setSaveError('');
      try {
        const res = await fetch(buildAgentApiUrl('/evals/dataset'), {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cases: casesToSave, judge_model: model || null }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          setSaveError((err as { detail?: string }).detail ?? `Error ${res.status}`);
        }
      } catch {
        setSaveError('Network error — could not reach the agent backend.');
      }
    };
    saveQueueRef.current = saveQueueRef.current.then(doSave, doSave);
  }

  /** Upserts a test case into the local cases array, autosaves, and closes the modal. */
  function handleSave(tc: TestCase) {
    const updated = (() => {
      const idx = cases.findIndex((c) => c.id === tc.id);
      if (idx >= 0) return cases.map((c) => c.id === tc.id ? tc : c);
      return [...cases, tc];
    })();
    setCases(updated);
    saveDataset(updated, judgeModel);
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


  const tagLabel = TAG_OPTIONS.find((o) => o.value === tagFilter)?.label ?? 'All tags';

  return (
    <div className="app-eval">
      <div className="app-eval__header">
        <Button
          variant="plain"
          onClick={() => navigate('/settings?tab=developer')}
          aria-label="Back to settings"
          icon={<ArrowLeftIcon />}
        />
        <Title headingLevel="h1" size="xl">Eval Dataset</Title>

        {!loading && availableModels.length > 0 && (
          <div className="app-eval__judge">
            <span className="app-eval__muted">Judge model</span>
            <FormSelect
              aria-label="Judge model"
              value={judgeModel}
              onChange={(_e, value) => { setJudgeModel(value); saveDataset(cases, value); }}
            >
              {availableModels.map((m) => (
                <FormSelectOption
                  key={m.model}
                  value={m.model}
                  label={`${m.model}${m.default ? ' (orchestrator)' : ` (${m.source.replace('subagent:', '')})`}`}
                />
              ))}
            </FormSelect>
          </div>
        )}

        {!loading && (
          <span className="app-eval__muted app-eval__header-count">
            {cases.length} test case{cases.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      <div className="app-eval__scroll">
        <div className="app-eval__content">
          {loading ? (
            <div className="app-eval__center">
              <Spinner size="lg" aria-label="Loading dataset" />
              <span className="app-eval__muted">Loading dataset…</span>
            </div>
          ) : loadError ? (
            <Alert
              variant="danger"
              isInline
              title={loadError}
              actionLinks={
                <AlertActionLink onClick={() => { setLoadError(''); void loadDataset(); }}>
                  Retry
                </AlertActionLink>
              }
            />
          ) : (
            <>
              <Card>
                <Toolbar className="app-eval__toolbar">
                  <ToolbarContent>
                    <ToolbarItem className="app-eval__toolbar-search">
                      <SearchInput
                        aria-label="Search test cases"
                        placeholder="Search test cases…"
                        value={search}
                        onChange={(_e, value) => setSearch(value)}
                        onClear={() => setSearch('')}
                      />
                    </ToolbarItem>
                    <ToolbarItem>
                      <Select
                        isOpen={tagMenuOpen}
                        selected={tagFilter}
                        onSelect={(_e, value) => { setTagFilter(value as CaseTag | 'all'); setTagMenuOpen(false); }}
                        onOpenChange={setTagMenuOpen}
                        toggle={(toggleRef: Ref<MenuToggleElement>) => (
                          <MenuToggle
                            ref={toggleRef}
                            aria-label="Filter by tag"
                            onClick={() => setTagMenuOpen((o) => !o)}
                            isExpanded={tagMenuOpen}
                          >
                            {tagLabel}
                          </MenuToggle>
                        )}
                      >
                        <SelectList>
                          {TAG_OPTIONS.map((opt) => (
                            <SelectOption key={opt.value} value={opt.value} isSelected={tagFilter === opt.value}>
                              {opt.label}
                            </SelectOption>
                          ))}
                        </SelectList>
                      </Select>
                    </ToolbarItem>
                    <ToolbarItem align={{ default: 'alignEnd' }}>
                      <Button
                        variant="primary"
                        icon={<PlusCircleIcon />}
                        onClick={() => { setEditingCase(undefined); setModalOpen(true); }}
                      >
                        Add Test Case
                      </Button>
                    </ToolbarItem>
                  </ToolbarContent>
                </Toolbar>
                <EvalDatasetTable
                  cases={filtered}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                />
              </Card>

              {cases.length > 0 && (
                <div className="app-eval__footer">
                  <span className="app-eval__muted">
                    {filtered.length !== cases.length
                      ? `Showing ${filtered.length} of ${cases.length} cases`
                      : `${cases.length} test case${cases.length !== 1 ? 's' : ''} in dataset`}
                  </span>
                  {saveError && (
                    <Alert variant="danger" isInline isPlain title={saveError} />
                  )}
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
