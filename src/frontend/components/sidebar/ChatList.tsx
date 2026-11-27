import type { DragEvent } from 'react';
import {
  EmptyState,
  EmptyStateBody,
  Label,
} from '@patternfly/react-core';
import { SpinnerIcon } from '@patternfly/react-icons';
import { buildAppPath } from '../../lib/app-paths';
import type { SidebarChatItem, SidebarProject } from '../../types/chat';
import type { SubAgentInfo } from '../../types/deep-agent';
import type { useSidebarDragDrop } from '../../hooks/useSidebarDragDrop';
import { isPlainLeftClick } from './isPlainLeftClick';
import { RowActions, type RowActionGroup } from './RowActions';
import { useTruncationTooltip } from './useTruncationTooltip';

export interface ChatRowContext {
  currentChatId?: string;
  activeSubAgent?: SubAgentInfo | null;
  projects: SidebarProject[];
  knownProjectIds: Set<string>;
  editingChat: string | null;
  editTitle: string;
  setEditTitle: (title: string) => void;
  startRename: (chatId: string, title: string) => void;
  saveRename: (chatId: string) => void;
  cancelRename: () => void;
  requestDelete: (chatId: string) => void;
  onSelectChat: (chatId: string) => void;
  onAssignThread?: (threadId: string, projectId: string | null) => Promise<boolean>;
  drag: ReturnType<typeof useSidebarDragDrop>;
}

export function ChatRow({ chat, ctx }: { chat: SidebarChatItem; ctx: ChatRowContext }) {
  const { textRef, handlers, tooltip } = useTruncationTooltip(chat.title);
  const isActive = ctx.currentChatId === chat.id;
  const isDragging = ctx.drag.draggedThreadId === chat.id;
  const isEditing = ctx.editingChat === chat.id;
  const inProject = Boolean(chat.project_id && ctx.knownProjectIds.has(chat.project_id));

  if (isEditing) {
    return (
      <li className="pf-v6-c-nav__item app-nav-row">
        <input
          value={ctx.editTitle}
          onChange={(e) => ctx.setEditTitle(e.target.value)}
          onBlur={() => ctx.saveRename(chat.id)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') ctx.saveRename(chat.id);
            if (e.key === 'Escape') ctx.cancelRename();
          }}
          aria-label={`Rename chat: ${chat.title}`}
          className="app-nav-rename pf-v6-c-form-control"
          autoFocus
        />
      </li>
    );
  }

  const groups: RowActionGroup[] = [
    {
      key: 'chat',
      actions: [
        {
          key: 'rename',
          label: 'Rename',
          onSelect: () => ctx.startRename(chat.id, chat.title),
        },
        {
          key: 'delete',
          label: 'Delete',
          isDanger: true,
          onSelect: () => ctx.requestDelete(chat.id),
        },
      ],
    },
  ];
  if (ctx.onAssignThread) {
    const assign = ctx.onAssignThread;
    if (inProject) {
      groups.unshift({
        key: 'project',
        actions: [
          {
            key: 'unassign',
            label: 'Remove from project',
            onSelect: () => void assign(chat.id, null),
          },
        ],
      });
    } else if (ctx.projects.length > 0) {
      groups.unshift({
        key: 'project',
        label: 'Add to project',
        actions: ctx.projects.map((p) => ({
          key: `project-${p.id}`,
          label: p.name,
          onSelect: () => void assign(chat.id, p.id),
        })),
      });
    }
  }

  return (
    <li
      className={`pf-v6-c-nav__item app-nav-row${isActive ? ' app-nav-row--active' : ''}${isDragging ? ' app-nav-row--dragging' : ''}`}
    >
      <a
        href={buildAppPath(`/chat/${chat.id}`)}
        className={`pf-v6-c-nav__link${isActive ? ' pf-m-current' : ''}`}
        aria-current={isActive ? 'page' : undefined}
        {...handlers}
        draggable
        onDragStart={(e: DragEvent<HTMLElement>) => ctx.drag.handleDragStart(e, chat.id)}
        onDragEnd={ctx.drag.handleDragEnd}
        onClick={(e) => {
          if (!isPlainLeftClick(e)) return;
          e.preventDefault();
          ctx.onSelectChat(chat.id);
        }}
      >
        <span ref={textRef} className="pf-v6-c-nav__link-text app-nav-truncate">
          {chat.title}
        </span>
        {tooltip}
        {isActive && ctx.activeSubAgent && (
          <Label isCompact color="blue" icon={<SpinnerIcon className="app-spin" />}>
            <span className="app-capitalize">{ctx.activeSubAgent.name}</span>
          </Label>
        )}
      </a>
      <div className="app-nav-row__actions">
        <RowActions aria-label={`Actions for chat: ${chat.title}`} groups={groups} />
      </div>
    </li>
  );
}

interface ChatListProps {
  chats: SidebarChatItem[];
  hasAnyChats: boolean;
  ctx: ChatRowContext;
}

/** Unassigned chats; also a drop target for removing a thread from its project. */
export function ChatList({ chats, hasAnyChats, ctx }: ChatListProps) {
  const { drag } = ctx;
  return (
    <li
      onDragOver={(e) => drag.handleDragOver(e, 'unassigned')}
      onDragLeave={drag.handleDragLeave}
      onDrop={(e) => void drag.handleDrop(e, null)}
      className={`pf-v6-c-nav__item app-drop-zone${drag.dragOverTarget === 'unassigned' ? ' app-drop-zone--over' : ''}`}
    >
      <h2 className="pf-v6-c-nav__section-title app-nav-section-title">Chats</h2>
      {chats.length === 0 ? (
        <EmptyState variant="xs" isFullHeight={false}>
          <EmptyStateBody>
            {hasAnyChats ? 'No unassigned chats' : 'No chats yet'}
          </EmptyStateBody>
        </EmptyState>
      ) : (
        <ul className="pf-v6-c-nav__list" aria-label="Chat history">
          {chats.map((chat) => (
            <ChatRow key={chat.id} chat={chat} ctx={ctx} />
          ))}
        </ul>
      )}
    </li>
  );
}
