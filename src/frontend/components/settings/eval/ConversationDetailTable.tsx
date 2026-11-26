import { useMemo, useState } from 'react';
import {
  Card,
  CardBody,
  Content,
  ExpandableSection,
  Label,
  Title,
  ToggleGroup,
  ToggleGroupItem,
} from '@patternfly/react-core';
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table';
import type { Turn, ConvStats } from './eval-types';
import { friendlyMetricName, friendlyConversationName, friendlyTagName } from './eval-utils';

interface ConversationDetailTableProps {
  turns: Turn[];
  byConversation?: Record<string, ConvStats>;
  activeTag?: string;
  availableTags?: string[];
  onTagChange?: (tag: string) => void;
}

type LabelColor = 'orange' | 'green' | 'blue';

const TAG_COLORS: Record<string, LabelColor> = {
  hitl: 'orange',
  tool_use: 'green',
  non_hitl: 'green',
  multi_turn: 'blue',
};

/** Returns the PF Label colour for a tag, falling back to blue for unknown tags. */
function tagColor(tag: string): LabelColor {
  return TAG_COLORS[tag] ?? 'blue';
}

/** Renders a per-conversation metrics table grouped by turn, with result badges and scores. */
function TurnTable({ convTurns }: { convTurns: Turn[] }) {
  const byTurn = useMemo(() => {
    const turnIndex = new Map<string, number>();
    const groups: { turnId: string; rows: Turn[] }[] = [];
    for (const t of convTurns) {
      const tid = t.turn_id ?? 'unknown';
      if (!turnIndex.has(tid)) {
        turnIndex.set(tid, groups.length);
        groups.push({ turnId: tid, rows: [] });
      }
      groups[turnIndex.get(tid)!].rows.push(t);
    }
    return groups;
  }, [convTurns]);

  const isMultiTurn = byTurn.length > 1;

  return (
    <Table aria-label="Metric results" variant="compact" isStriped={false}>
      <Thead>
        <Tr>
          <Th width={20}>Metric</Th>
          <Th width={10}>Result</Th>
          <Th width={10}>Score</Th>
          <Th>Reason</Th>
        </Tr>
      </Thead>
      {byTurn.map(({ turnId, rows }, turnIdx) => (
        <Tbody key={turnId}>
          {isMultiTurn && (
            <Tr>
              <Td colSpan={4}>
                <Content component="small">
                  <strong>
                    {rows[0]?.query
                      ? `Turn ${byTurn.slice(0, turnIdx + 1).filter((g) => g.rows[0]?.query).length}`
                      : 'Conversation Level Metric'}
                  </strong>
                  {rows[0]?.query && (
                    <>
                      {' '}
                      — {rows[0].query.slice(0, 60)}
                      {rows[0].query.length > 60 ? '…' : ''}
                    </>
                  )}
                </Content>
              </Td>
            </Tr>
          )}
          {rows.map((turn, i) => {
            const result = (turn.result ?? '').toUpperCase();
            const color = result === 'PASS' ? 'green' : result === 'FAIL' ? 'red' : 'orange';
            return (
              <Tr key={`${turnId}-${i}`}>
                <Td dataLabel="Metric">{friendlyMetricName(turn.metric_identifier ?? '')}</Td>
                <Td dataLabel="Result">
                  <Label isCompact color={color}>
                    {turn.result ?? '—'}
                  </Label>
                </Td>
                <Td dataLabel="Score">{turn.score != null ? Number(turn.score).toFixed(2) : '—'}</Td>
                <Td dataLabel="Reason" modifier="breakWord">
                  {turn.reason ?? '—'}
                </Td>
              </Tr>
            );
          })}
        </Tbody>
      ))}
    </Table>
  );
}

/** Expandable accordion of conversations with per-metric turn details and tag-based filtering. */
export function ConversationDetailTable({
  turns,
  byConversation,
  activeTag,
  availableTags = [],
  onTagChange,
}: ConversationDetailTableProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const grouped: Record<string, Turn[]> = {};
  for (const t of turns) {
    const conv = t.conversation_group_id ?? 'unknown';
    if (!grouped[conv]) grouped[conv] = [];
    grouped[conv].push(t);
  }

  const filteredEntries = Object.entries(grouped).filter(([, convTurns]) => {
    if (!activeTag || activeTag === 'all') return true;
    return convTurns.some((t) => t.tag === activeTag);
  });

  if (filteredEntries.length === 0 && availableTags.length === 0) return null;

  const showChips = availableTags.length > 0 && !!onTagChange;

  return (
    <div className="app-settings__stack" style={{ gap: 'var(--pf-t--global--spacer--md)' }}>
      <div className="app-settings__row" style={{ flexWrap: 'wrap' }}>
        <Title headingLevel="h4" size="md">
          Conversations
        </Title>
        {showChips && (
          <div className="app-settings__inline" style={{ flexWrap: 'wrap' }}>
            <Content component="small">Filter by tag:</Content>
            <ToggleGroup aria-label="Filter by tag" isCompact>
              {['all', ...availableTags].map((tag) => (
                <ToggleGroupItem
                  key={tag}
                  text={tag === 'all' ? 'All' : friendlyTagName(tag)}
                  buttonId={`eval-tag-${tag}`}
                  isSelected={(activeTag ?? 'all') === tag}
                  onChange={() => onTagChange?.(tag)}
                />
              ))}
            </ToggleGroup>
          </div>
        )}
      </div>

      {filteredEntries.length === 0 ? (
        <Content component="small">No conversations match this tag.</Content>
      ) : (
        <div className="app-settings__stack" style={{ gap: 'var(--pf-t--global--spacer--md)' }}>
          {filteredEntries.map(([conv, convTurns]) => {
            const isOpen = expanded[conv] ?? true;
            const convStats = byConversation?.[conv];
            const pass = convStats?.pass ?? 0;
            const fail = convStats?.fail ?? 0;
            const total = pass + fail;
            const rate = total > 0 ? Math.round((pass / total) * 100) : null;
            const convTag = convTurns[0]?.tag;

            return (
              <Card key={conv} isCompact>
                <CardBody>
                  <ExpandableSection
                    isExpanded={isOpen}
                    onToggle={(_event, next) => setExpanded((prev) => ({ ...prev, [conv]: next }))}
                    toggleContent={
                      <span className="app-settings__inline" style={{ flexWrap: 'wrap' }}>
                        <strong>{friendlyConversationName(conv)}</strong>
                        {convTag && (
                          <Label isCompact color={tagColor(convTag)}>
                            {friendlyTagName(convTag)}
                          </Label>
                        )}
                        {rate != null && (
                          <Label isCompact color={fail === 0 ? 'green' : 'red'}>
                            {rate}%
                          </Label>
                        )}
                        {total > 0 && (
                          <Content component="small">
                            {pass}/{total} checks
                          </Content>
                        )}
                      </span>
                    }
                  >
                    <TurnTable convTurns={convTurns} />
                  </ExpandableSection>
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
