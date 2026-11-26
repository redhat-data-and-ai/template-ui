import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, NavExpandable } from '@patternfly/react-core';
import {
  AngleRightIcon,
  FolderIcon,
  FolderPlusIcon,
} from '@patternfly/react-icons';
import { buildAppPath } from '../../lib/app-paths';
import type { SidebarChatItem, SidebarProject } from '../../types/chat';
import { ChatRow, type ChatRowContext } from './ChatList';
import { isPlainLeftClick } from './isPlainLeftClick';
import { RowActions, type RowActionGroup } from './RowActions';

interface ProjectListProps {
  projects: SidebarProject[];
  chatsByProject: Record<string, SidebarChatItem[]>;
  isProjectExpanded: (projectId: string) => boolean;
  onToggleProject: (projectId: string) => void;
  ctx: ChatRowContext;
  onNewProject?: () => void;
  onNewChatInProject: (projectId: string) => void;
  onEditProject?: (project: SidebarProject) => void;
  onDeleteProject?: (projectId: string) => void;
  onUnassignAll?: (projectId: string) => void;
}

export function ProjectList({
  projects,
  chatsByProject,
  isProjectExpanded,
  onToggleProject,
  ctx,
  onNewProject,
  onNewChatInProject,
  onEditProject,
  onDeleteProject,
  onUnassignAll,
}: ProjectListProps) {
  const navigate = useNavigate();
  const { drag } = ctx;
  const [groupExpanded, setGroupExpanded] = useState(true);

  return (
    <NavExpandable
      title="Projects"
      groupId="projects"
      isExpanded={groupExpanded}
      onExpand={(_event, expanded) => setGroupExpanded(expanded)}
    >
      {onNewProject && (
        <li className="pf-v6-c-nav__item">
          <Button
            variant="plain"
            className="app-nav-new-project"
            icon={<FolderPlusIcon />}
            aria-label="New project"
            onClick={onNewProject}
          >
            New project
          </Button>
        </li>
      )}
      {projects.length === 0 && (
        <li className="app-nav-empty">No projects yet</li>
      )}
      {projects.map((project) => {
        const expanded = isProjectExpanded(project.id);
        const projectChats = chatsByProject[project.id] ?? [];
        const isDropTarget = drag.dragOverTarget === project.id;

        const groups: RowActionGroup[] = [
          {
            key: 'project',
            actions: [
              {
                key: 'new-chat',
                label: 'New chat in project',
                onSelect: () => onNewChatInProject(project.id),
              },
              ...(onUnassignAll && project.threadCount > 0
                ? [
                    {
                      key: 'unassign-all',
                      label: 'Unassign all chats',
                      onSelect: () => onUnassignAll(project.id),
                    },
                  ]
                : []),
              ...(onEditProject
                ? [
                    {
                      key: 'edit',
                      label: 'Edit project',
                      onSelect: () => onEditProject(project),
                    },
                  ]
                : []),
              ...(onDeleteProject
                ? [
                    {
                      key: 'delete',
                      label: 'Delete project',
                      isDanger: true,
                      onSelect: () => onDeleteProject(project.id),
                    },
                  ]
                : []),
            ],
          },
        ];

        return (
          <li
            key={project.id}
            className={`pf-v6-c-nav__item app-drop-zone${isDropTarget ? ' app-drop-zone--over' : ''}`}
            onDragOver={(e) => drag.handleDragOver(e, project.id)}
            onDragLeave={drag.handleDragLeave}
            onDrop={(e) => void drag.handleDrop(e, project.id)}
          >
            <div className="app-nav-row app-project-row">
              <button
                type="button"
                className="app-project-row__toggle"
                aria-expanded={expanded}
                aria-label={`${expanded ? 'Collapse' : 'Expand'} ${project.name}`}
                onClick={() => onToggleProject(project.id)}
              >
                <AngleRightIcon
                  className={`app-project-row__chevron${expanded ? ' is-expanded' : ''}`}
                />
              </button>
              <a
                href={buildAppPath(`/project/${project.id}`)}
                className="pf-v6-c-nav__link app-project-row__link"
                title={project.name}
                onClick={(e) => {
                  if (!isPlainLeftClick(e)) return;
                  e.preventDefault();
                  navigate(`/project/${project.id}`);
                }}
              >
                <FolderIcon aria-hidden />
                <span className="pf-v6-c-nav__link-text app-nav-truncate">{project.name}</span>
                <span className="app-project-row__count">{project.threadCount}</span>
              </a>
              <div className="app-nav-row__actions">
                <RowActions
                  aria-label={`Actions for project ${project.name}`}
                  groups={groups}
                />
              </div>
            </div>
            {expanded && (
              <ul
                className="pf-v6-c-nav__list app-project-chats max-h-48 overflow-y-auto chat-scroll"
                aria-label={`${project.name} chats`}
              >
                {projectChats.length === 0 ? (
                  <li className="app-nav-empty">No chats</li>
                ) : (
                  projectChats.map((chat) => (
                    <ChatRow key={chat.id} chat={chat} ctx={ctx} />
                  ))
                )}
              </ul>
            )}
          </li>
        );
      })}
    </NavExpandable>
  );
}
