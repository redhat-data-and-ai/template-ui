import { useState, useEffect } from 'react';
import {
  Alert,
  Button,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalVariant,
  ToggleGroup,
  ToggleGroupItem,
} from '@patternfly/react-core';
import type { TestCase, Turn, CaseTag } from './eval-dataset-types';
import { emptyTurn } from './eval-dataset-utils';
import { SingleTurnForm } from './SingleTurnForm';
import { MultiTurnForm } from './MultiTurnForm';
import '../dialogs.css';

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
    if (!/^[a-z0-9][a-z0-9-]{1,18}[a-z0-9]$/.test(name.trim())) {
      setError('Name must be 3–20 characters: lowercase letters, numbers, and hyphens. Must start and end with alphanumeric.');
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

  const title = isEditing ? 'Edit Test Case' : 'Add Test Case';

  return (
    <Modal
      variant={ModalVariant.medium}
      isOpen
      onClose={onClose}
      // Escape must not discard a half-written case; closing is explicit (X / Cancel).
      onEscapePress={() => {}}
      aria-labelledby="test-case-modal-title"
    >
      <ModalHeader title={title} labelId="test-case-modal-title" />
      <ModalBody>
        {!isEditing && (
          <ToggleGroup aria-label="Test case type" className="app-eval-form__mode">
            <ToggleGroupItem
              text="Single turn"
              buttonId="test-case-mode-single"
              isSelected={mode === 'single'}
              onChange={() => handleModeSwitch('single')}
            />
            <ToggleGroupItem
              text="Multi-turn conversation"
              buttonId="test-case-mode-multi"
              isSelected={mode === 'multi'}
              onChange={() => handleModeSwitch('multi')}
            />
          </ToggleGroup>
        )}
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
      </ModalBody>
      <ModalFooter className="app-eval-form__footer">
        {error && (
          <Alert
            className="app-eval-form__error"
            variant="danger"
            isInline
            isLiveRegion
            title={error}
          />
        )}
        <Button variant="primary" onClick={handleSave}>
          {isEditing ? 'Update Test Case' : 'Save Test Case'}
        </Button>
        <Button variant="link" onClick={onClose}>
          Cancel
        </Button>
      </ModalFooter>
    </Modal>
  );
}
