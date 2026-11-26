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
  Label,
  Switch,
  TextArea,
  TextInput,
} from '@patternfly/react-core';
import { PlusCircleIcon, TimesIcon } from '@patternfly/react-icons';
import type { Turn, ToolCall } from './eval-dataset-types';
import { emptyToolCall, emptyTurn, normTurn } from './eval-dataset-utils';
import { KeywordsEditor, ToolCallEditor } from './ToolCallEditor';

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
  const uid = useId();
  const safeTurns = turns.map(normTurn);
  const toolCallTotal = safeTurns.reduce((sum, t) => sum + (t.toolCallEnabled ? Math.max(1, t.expectedToolCalls.length) : 0), 0);

  /** Immutably patches a single turn at the given index and propagates via onTurnsChange. */
  function updateTurn(idx: number, patch: Partial<Turn>) {
    onTurnsChange(turns.map((t, i) => (i === idx ? { ...t, ...patch } : t)));
  }

  /** Immutably patches the tool call at index ci within turn ti. */
  function updateToolCall(ti: number, ci: number, patch: Partial<ToolCall>) {
    updateTurn(ti, {
      expectedToolCalls: turns[ti].expectedToolCalls.map((tc, i) => (i === ci ? { ...tc, ...patch } : tc)),
    });
  }

  return (
    <Form onSubmit={(e) => e.preventDefault()}>
      <FormGroup label="Test Case Name" isRequired fieldId={`${uid}-name`}>
        <div className="app-eval-form__inline">
          <div className="app-eval-form__mono">
            <TextInput
              id={`${uid}-name`}
              type="text"
              isRequired
              value={name}
              onChange={(_e, v) => onNameChange(v.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
              placeholder="e.g. multi-turn-onboarding"
              maxLength={20}
            />
          </div>
          <Label variant="outline">multi_turn</Label>
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
          placeholder="Brief description of this multi-turn scenario"
        />
      </FormGroup>

      {safeTurns.map((turn, ti) => {
        const tid = `${uid}-t${ti}`;
        const tlabel = `Turn ${ti + 1}`;
        return (
          <Card key={turn.id} isCompact>
            <CardHeader
              actions={ti > 0 ? {
                actions: (
                  <Button
                    variant="plain"
                    aria-label={`Remove turn ${ti + 1}`}
                    icon={<TimesIcon />}
                    onClick={() => onTurnsChange(turns.filter((_, i) => i !== ti))}
                  />
                ),
                hasNoOffset: true,
              } : undefined}
            >
              <CardTitle>{tlabel}</CardTitle>
            </CardHeader>
            <CardBody>
              <div className="app-eval-form__stack">
                <FormGroup label="User says" isRequired fieldId={`${tid}-user`}>
                  <TextArea
                    id={`${tid}-user`}
                    isRequired
                    value={turn.userMessage}
                    onChange={(_e, v) => updateTurn(ti, { userMessage: v })}
                    rows={2}
                    resizeOrientation="vertical"
                    placeholder="What the user says in this turn…"
                  />
                </FormGroup>
                <FormGroup label="Agent should respond" isRequired fieldId={`${tid}-resp`}>
                  <TextArea
                    id={`${tid}-resp`}
                    isRequired
                    value={turn.expectedResponse}
                    onChange={(_e, v) => updateTurn(ti, { expectedResponse: v })}
                    rows={2}
                    resizeOrientation="vertical"
                    placeholder="What the agent should respond with…"
                  />
                </FormGroup>
                <FormGroup label="User intent" fieldId={`${tid}-intent`}>
                  <TextInput
                    id={`${tid}-intent`}
                    type="text"
                    value={turn.expectedIntent}
                    onChange={(_e, v) => updateTurn(ti, { expectedIntent: v })}
                    placeholder="Optional: what is the user trying to accomplish in this turn?"
                  />
                </FormGroup>

                <KeywordsEditor
                  label={tlabel}
                  keywords={turn.expectedKeywords ?? ['']}
                  onChange={(kw) => updateTurn(ti, { expectedKeywords: kw })}
                />

                <Switch
                  id={`${tid}-tools`}
                  label="This turn expects a tool call (Action)"
                  aria-label={`${tlabel} expects a tool call`}
                  isChecked={turn.toolCallEnabled}
                  onChange={(_e, checked) => {
                    updateTurn(ti, {
                      toolCallEnabled: checked,
                      expectedToolCalls: checked && turn.expectedToolCalls.length === 0
                        ? [emptyToolCall()]
                        : turn.expectedToolCalls,
                    });
                  }}
                />

                {turn.toolCallEnabled && (
                  <div className="app-eval-form__stack">
                    <Checkbox
                      id={`${tid}-ordered`}
                      label="Must be called in exact order"
                      description="Default: any order"
                      isChecked={turn.toolCallOrdered}
                      onChange={(_e, checked) => updateTurn(ti, { toolCallOrdered: checked })}
                    />
                    {turn.expectedToolCalls.map((tc, ci) => (
                      <ToolCallEditor
                        key={ci}
                        label={`${tlabel} tool ${ci + 1}`}
                        title={`Tool ${ci + 1}`}
                        toolCall={tc}
                        canRemove={turn.expectedToolCalls.length > 1}
                        onChange={(patch) => updateToolCall(ti, ci, patch)}
                        onRemove={() => updateTurn(ti, {
                          expectedToolCalls: turns[ti].expectedToolCalls.filter((_, i) => i !== ci),
                        })}
                      />
                    ))}
                    <div>
                      <Button
                        variant="link"
                        isInline
                        icon={<PlusCircleIcon />}
                        onClick={() => updateTurn(ti, {
                          expectedToolCalls: [...turns[ti].expectedToolCalls, emptyToolCall()],
                        })}
                      >
                        Add tool call
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </CardBody>
          </Card>
        );
      })}

      <div>
        <Button
          variant="secondary"
          icon={<PlusCircleIcon />}
          onClick={() => onTurnsChange([...turns, emptyTurn()])}
        >
          Add another turn
        </Button>
      </div>

      <div className="app-eval-form__summary">
        {turns.length} turn{turns.length !== 1 ? 's' : ''} · tag: <strong>multi_turn</strong>
        {toolCallTotal > 0 && ` · ${toolCallTotal} tool call${toolCallTotal !== 1 ? 's' : ''} expected`}
      </div>
    </Form>
  );
}
