import { useCallback, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import {
  Button,
  Card,
  CardBody,
  EmptyState,
  EmptyStateBody,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalVariant,
  Spinner,
  Title,
} from '@patternfly/react-core';
import { CommentsIcon, FolderMinusIcon, PlusIcon } from '@patternfly/react-icons';
import { useAppDispatch, useAppSelector } from '../redux/hooks';
import { addChat, selectChatsByProject, type ChatItem } from '../redux/slices/chats';
import {
  selectProjectById,
  selectProjectsLoading,
  unassignAllThreadsThunk,
  updateProjectThreadCount,
} from '../redux/slices/projects';
import { addToast } from '../redux/slices/toasts';
import { markChatAsClientCreated } from '../services/newChatTracker';
import './pages.css';

export function ProjectChatPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const project = useAppSelector((state) =>
    projectId ? selectProjectById(state, projectId) : undefined,
  );
  const projectChats = useAppSelector((state) =>
    projectId ? selectChatsByProject(state, projectId) : [],
  );
  const isLoading = useAppSelector(selectProjectsLoading);
  const [unassignConfirmOpen, setUnassignConfirmOpen] = useState(false);
  const [unassignBusy, setUnassignBusy] = useState(false);

  const startChat = useCallback(() => {
    if (!projectId) return;
    const newId = uuidv4();
    markChatAsClientCreated(newId);
    const newChat: ChatItem = {
      id: newId,
      title: 'New Chat',
      timestamp: new Date().toISOString(),
      preview: 'Start a new conversation',
      messages: [],
      historicalActivities: {},
      feedback: {},
      project_id: projectId,
    };
    dispatch(addChat(newChat));
    dispatch(updateProjectThreadCount({ projectId, delta: 1 }));
    navigate(`/chat/${newId}`, { state: { newChat: true } });
  }, [dispatch, navigate, projectId]);

  const unassignAll = useCallback(async () => {
    if (!projectId) return;
    setUnassignBusy(true);
    try {
      await dispatch(unassignAllThreadsThunk(projectId)).unwrap();
      dispatch(addToast({ title: 'Conversations moved to Chats', variant: 'success' }));
      setUnassignConfirmOpen(false);
    } catch {
      dispatch(addToast({ title: 'Failed to unassign conversations', variant: 'danger' }));
    } finally {
      setUnassignBusy(false);
    }
  }, [dispatch, projectId]);

  if (isLoading && !project) {
    return (
      <div className="app-center-fill">
        <Spinner size="lg" aria-label="Loading project" />
        <p>Loading project...</p>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="app-center-fill">
        <p>Project not found</p>
      </div>
    );
  }

  const visibleCount = Math.max(project.thread_count, projectChats.length);

  return (
    <div className="app-project">
      <div className="app-project__head">
        <Title headingLevel="h1" size="2xl">{project.project_name}</Title>
        {project.project_description && (
          <p className="app-project__desc">{project.project_description}</p>
        )}
        <p className="app-project__count">
          {visibleCount} conversation(s)
        </p>
      </div>

      <div className="app-project__actions">
        <Button variant="primary" onClick={startChat} icon={<PlusIcon />}>
          New Chat in Project
        </Button>
        {visibleCount > 0 && (
          <Button
            variant="secondary"
            onClick={() => setUnassignConfirmOpen(true)}
            icon={<FolderMinusIcon />}
          >
            Unassign all
          </Button>
        )}
      </div>

      <div
        className="app-project__list"
        role="region"
        aria-label="Project conversations"
      >
        {projectChats.length === 0 ? (
          <EmptyState variant="sm" icon={CommentsIcon} titleText="No conversations yet" headingLevel="h2">
            <EmptyStateBody>Start one above.</EmptyStateBody>
          </EmptyState>
        ) : (
          projectChats.map((chat) => (
            <Card
              key={chat.id}
              isCompact
              className="app-project__item"
              onClick={() => navigate(`/chat/${chat.id}`)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  navigate(`/chat/${chat.id}`);
                }
              }}
              role="button"
              tabIndex={0}
            >
              <CardBody>
                <div className="app-project__item-title">{chat.title}</div>
                <div className="app-project__item-preview">{chat.preview}</div>
              </CardBody>
            </Card>
          ))
        )}
      </div>

      <Modal
        variant={ModalVariant.small}
        isOpen={unassignConfirmOpen}
        onClose={() => {
          if (!unassignBusy) setUnassignConfirmOpen(false);
        }}
        aria-label="Unassign all conversations confirmation"
      >
        <ModalHeader title="Unassign all conversations" />
        <ModalBody>Move every conversation in this project back to Chats?</ModalBody>
        <ModalFooter>
          <Button
            variant="danger"
            isDisabled={unassignBusy}
            onClick={() => void unassignAll()}
          >
            Unassign
          </Button>
          <Button
            variant="link"
            isDisabled={unassignBusy}
            onClick={() => setUnassignConfirmOpen(false)}
          >
            Cancel
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
