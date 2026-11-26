import { useId } from 'react';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Checkbox,
  Form,
  FormGroup,
  FormHelperText,
  HelperText,
  HelperTextItem,
  Switch,
  TextArea,
  TextInput,
} from '@patternfly/react-core';
import { PlusCircleIcon } from '@patternfly/react-icons';
import type { Turn, ToolCall, CaseTag } from './eval-dataset-types';
import { emptyToolCall, normTurn } from './eval-dataset-utils';
import { KeywordsEditor, ToolCallEditor } from './ToolCallEditor';

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

const TAG_CHOICES: { value: CaseTag; label: string; desc: string }[] = [
  { value: 'non_hitl', label: 'Non-HITL', desc: 'Automated evaluation, no human approval' },
  { value: 'hitl', label: 'HITL approval', desc: 'Requires human-in-the-loop approval step' },
];

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
  const uid = useId();
  const isHitl = tag === 'hitl';
  const safeTurn = normTurn(turn);

  /** Merges a partial update into the current turn and propagates via onTurnChange. */
  function updateTurn(patch: Partial<Turn>) {
    onTurnChange({ ...safeTurn, ...patch });
  }

  /** Immutably patches the tool call at the given index. */
  function updateToolCall(i: number, patch: Partial<ToolCall>) {
    updateTurn({
      expectedToolCalls: safeTurn.expectedToolCalls.map((tc, idx) => (idx === i ? { ...tc, ...patch } : tc)),
    });
  }

  return (
    <Form onSubmit={(e) => e.preventDefault()}>
      <FormGroup label="Test Case Name" isRequired fieldId={`${uid}-name`}>
        <div className="app-eval-form__mono">
          <TextInput
            id={`${uid}-name`}
            type="text"
            isRequired
            value={name}
            onChange={(_e, v) => onNameChange(v.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
            placeholder="e.g. calculate-bmi-standard"
            maxLength={20}
          />
        </div>
        <FormHelperText>
          <HelperText>
            <HelperTextItem>
              3–20 chars, lowercase alphanumeric and hyphens, must start and end with alphanumeric
            </HelperTextItem>
          </HelperText>
        </FormHelperText>
      </FormGroup>

      <FormGroup label="Description" isRequired fieldId={`${uid}-desc`}>
        <TextInput
          id={`${uid}-desc`}
          type="text"
          isRequired
          value={description}
          onChange={(_e, v) => onDescriptionChange(v)}
          placeholder="Brief description of what this test case validates"
        />
      </FormGroup>

      <FormGroup label="Tag" isRequired role="radiogroup" fieldId={`${uid}-tag`}>
        <div className="app-eval-form__tags">
          {TAG_CHOICES.map((opt) => (
            <Card key={opt.value} isSelectable isSelected={tag === opt.value} isCompact>
              <CardHeader
                selectableActions={{
                  selectableActionId: `${uid}-tag-${opt.value}`,
                  selectableActionAriaLabelledby: `${uid}-tag-${opt.value}-title`,
                  name: `${uid}-tag`,
                  variant: 'single',
                  isChecked: tag === opt.value,
                  onChange: () => onTagChange(opt.value),
                }}
              >
                <CardTitle id={`${uid}-tag-${opt.value}-title`}>{opt.label}</CardTitle>
              </CardHeader>
              <CardBody>{opt.desc}</CardBody>
            </Card>
          ))}
        </div>
      </FormGroup>

      <FormGroup label="What does the user ask?" isRequired fieldId={`${uid}-ask`}>
        <TextArea
          id={`${uid}-ask`}
          isRequired
          value={safeTurn.userMessage}
          onChange={(_e, v) => updateTurn({ userMessage: v })}
          rows={3}
          resizeOrientation="vertical"
          placeholder="Enter the user's question or request…"
        />
      </FormGroup>

      <FormGroup label="What should the agent respond with?" isRequired fieldId={`${uid}-resp`}>
        <TextArea
          id={`${uid}-resp`}
          isRequired
          value={safeTurn.expectedResponse}
          onChange={(_e, v) => updateTurn({ expectedResponse: v })}
          rows={3}
          resizeOrientation="vertical"
          placeholder="Describe the ideal agent response…"
        />
      </FormGroup>

      {!isHitl && (
        <>
          <FormGroup label="What is the user trying to accomplish?" fieldId={`${uid}-intent`}>
            <TextArea
              id={`${uid}-intent`}
              value={safeTurn.expectedIntent}
              onChange={(_e, v) => updateTurn({ expectedIntent: v })}
              rows={2}
              resizeOrientation="vertical"
              placeholder="e.g. User wants to calculate their BMI to assess health status"
            />
            <FormHelperText>
              <HelperText>
                <HelperTextItem>Optional. Describes the underlying goal for intent evaluation.</HelperTextItem>
              </HelperText>
            </FormHelperText>
          </FormGroup>

          <KeywordsEditor
            label="Expected"
            keywords={safeTurn.expectedKeywords}
            onChange={(kw) => updateTurn({ expectedKeywords: kw })}
          />

          <FormGroup label="Expected tool calls (Actions)" fieldId={`${uid}-tools`}>
            <Switch
              id={`${uid}-tools`}
              label={safeTurn.toolCallEnabled ? 'On' : 'Off'}
              aria-label="Expected tool calls"
              isChecked={safeTurn.toolCallEnabled}
              onChange={(_e, checked) => {
                updateTurn({
                  toolCallEnabled: checked,
                  expectedToolCalls: checked && safeTurn.expectedToolCalls.length === 0
                    ? [emptyToolCall()]
                    : safeTurn.expectedToolCalls,
                });
              }}
            />
            <FormHelperText>
              <HelperText>
                <HelperTextItem>Optional. Define which tools the agent should call.</HelperTextItem>
              </HelperText>
            </FormHelperText>
          </FormGroup>

          {safeTurn.toolCallEnabled && (
            <div className="app-eval-form__stack">
              <Checkbox
                id={`${uid}-ordered`}
                label="Tool calls must be in exact order"
                description="Default: any order"
                isChecked={safeTurn.toolCallOrdered}
                onChange={(_e, checked) => updateTurn({ toolCallOrdered: checked })}
              />
              {safeTurn.expectedToolCalls.map((tc, ti) => (
                <ToolCallEditor
                  key={ti}
                  label={`Tool ${ti + 1}`}
                  title={`Tool ${ti + 1}`}
                  toolCall={tc}
                  canRemove={safeTurn.expectedToolCalls.length > 1}
                  onChange={(patch) => updateToolCall(ti, patch)}
                  onRemove={() => updateTurn({
                    expectedToolCalls: safeTurn.expectedToolCalls.filter((_, idx) => idx !== ti),
                  })}
                />
              ))}
              <div>
                <Button
                  variant="secondary"
                  icon={<PlusCircleIcon />}
                  onClick={() => updateTurn({ expectedToolCalls: [...safeTurn.expectedToolCalls, emptyToolCall()] })}
                >
                  Add tool call
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </Form>
  );
}
