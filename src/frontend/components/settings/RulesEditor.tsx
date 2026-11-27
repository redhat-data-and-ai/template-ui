import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  CardBody,
  EmptyState,
  EmptyStateBody,
  Switch,
  TextArea,
} from '@patternfly/react-core';
import { OutlinedFileAltIcon, PlusIcon, TrashIcon } from '@patternfly/react-icons';
import { useAppDispatch, useAppSelector } from '../../redux/hooks';
import {
  addRuleAndPersist,
  fetchRules,
  persistClearRules,
  persistRemoveRule,
  persistRule,
  setRuleActive,
  removeRule,
  clearRules,
  selectRules,
} from '../../redux/slices/personalization';

export function RulesEditor() {
  const dispatch = useAppDispatch();
  const rules = useAppSelector(selectRules);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    dispatch(fetchRules());
  }, [dispatch]);

  const handleAdd = () => {
    const text = draft.trim();
    if (!text) return;
    void dispatch(addRuleAndPersist(text));
    setDraft('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAdd();
    }
  };

  return (
    <div className="app-settings__stack">
      <Alert component="h3" isInline variant="warning" title="Rules apply to every conversation">
        Custom rules shape how the agent responds. They apply to every conversation unless
        individually disabled.
      </Alert>

      <div className="app-settings__row" style={{ alignItems: 'flex-end' }}>
        <TextArea
          value={draft}
          onChange={(_event, value) => setDraft(value)}
          onKeyDown={handleKeyDown}
          placeholder="e.g. Always respond in British English"
          aria-label="New rule"
          resizeOrientation="vertical"
          rows={2}
          style={{ flex: 1 }}
        />
        <Button variant="primary" isDisabled={!draft.trim()} onClick={handleAdd} icon={<PlusIcon />}>
          Add
        </Button>
      </div>

      {rules.length === 0 ? (
        <EmptyState headingLevel="h3" titleText="No custom rules" icon={OutlinedFileAltIcon} variant="sm">
          <EmptyStateBody>Add instructions for the agent to follow</EmptyStateBody>
        </EmptyState>
      ) : (
        <>
          <ul className="app-settings__list">
            {rules.map((rule) => (
              <li key={rule.id}>
                <Card isCompact style={{ width: '100%' }}>
                  <CardBody>
                    <div className="app-settings__row" style={{ alignItems: 'flex-start' }}>
                      <Switch
                        id={`rule-toggle-${rule.id}`}
                        aria-label={`Toggle rule: ${rule.content.substring(0, 50)}`}
                        isChecked={rule.isActive}
                        onChange={(_event, checked) => {
                          dispatch(setRuleActive({ id: rule.id, isActive: checked }));
                          void dispatch(
                            persistRule({
                              id: rule.id,
                              content: rule.content,
                              isActive: checked,
                            }),
                          );
                        }}
                      />
                      <p
                        className={`app-settings__item-text${rule.isActive ? '' : ' app-settings__item-text--off'}`}
                      >
                        {rule.content}
                      </p>
                      <Button
                        variant="plain"
                        icon={<TrashIcon />}
                        aria-label={`Remove rule: ${rule.content.substring(0, 50)}`}
                        onClick={() => {
                          dispatch(removeRule(rule.id));
                          void dispatch(persistRemoveRule(rule.id));
                        }}
                      />
                    </div>
                  </CardBody>
                </Card>
              </li>
            ))}
          </ul>
          {rules.length > 1 && (
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button
                variant="link"
                isDanger
                onClick={() => {
                  dispatch(clearRules());
                  void dispatch(persistClearRules());
                }}
              >
                Clear all rules
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
