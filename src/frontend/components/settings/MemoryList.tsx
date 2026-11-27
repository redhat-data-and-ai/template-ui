import { useEffect } from 'react';
import {
  Alert,
  Button,
  Card,
  CardBody,
  EmptyState,
  EmptyStateBody,
  Spinner,
  Title,
} from '@patternfly/react-core';
import { BrainIcon, TrashIcon } from '@patternfly/react-icons';
import { useAppDispatch, useAppSelector } from '../../redux/hooks';
import {
  fetchMemories,
  deleteMemory,
  deleteAllMemories,
  selectMemories,
  selectMemoriesLoading,
  selectPersonalizationError,
} from '../../redux/slices/personalization';

export function MemoryList() {
  const dispatch = useAppDispatch();
  const memories = useAppSelector(selectMemories);
  const memoriesLoading = useAppSelector(selectMemoriesLoading);
  const error = useAppSelector(selectPersonalizationError);

  useEffect(() => {
    dispatch(fetchMemories());
  }, [dispatch]);

  return (
    <div className="app-settings__stack">
      <Alert component="h3" isInline variant="info" title="Memories">
        These are memories the agent has created about you across conversations. You can delete them
        at any time.
      </Alert>

      {error && <Alert component="h3" isInline variant="danger" title={error} />}

      {memoriesLoading ? (
        <div className="app-settings__center">
          <Spinner size="md" aria-label="Loading memories" />
        </div>
      ) : memories.length === 0 ? (
        <EmptyState
          headingLevel="h3"
          titleText="No memories yet"
          icon={BrainIcon}
          variant="sm"
        >
          <EmptyStateBody>The agent will learn about you as you interact with it</EmptyStateBody>
        </EmptyState>
      ) : (
        <section>
          <div className="app-settings__row" style={{ marginBlockEnd: 'var(--pf-t--global--spacer--md)' }}>
            <Title headingLevel="h3" size="md">
              Memories <span className="app-settings__muted">({memories.length})</span>
            </Title>
            <Button variant="link" isDanger onClick={() => dispatch(deleteAllMemories())}>
              Delete All
            </Button>
          </div>
          <ul className="app-settings__list">
            {memories.map((memory) => (
              <li key={memory.id}>
                <Card isCompact isFullHeight={false} style={{ width: '100%' }}>
                  <CardBody>
                    <div className="app-settings__row" style={{ alignItems: 'flex-start' }}>
                      <p className="app-settings__item-text">{memory.content}</p>
                      <Button
                        variant="plain"
                        aria-label="Delete memory"
                        icon={<TrashIcon />}
                        onClick={() => dispatch(deleteMemory(memory.id))}
                      />
                    </div>
                  </CardBody>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
