import { useCallback, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { Button, Modal, ModalBody, ModalFooter, ModalHeader, ModalVariant, Spinner } from '@patternfly/react-core';
import { Plus, MessageSquare, FolderMinus } from 'lucide-react';
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
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <Spinner size="lg" aria-label="Loading project" />
        <p className="text-muted-foreground">Loading project...</p>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Project not found</p>
      </div>
    );
  }

  const visibleCount = Math.max(project.thread_count, projectChats.length);

  return (
    <div className="flex flex-col h-full min-h-0 p-6 max-w-3xl mx-auto">
      <div className="shrink-0 mb-6">
        <h1 className="text-2xl font-bold">{project.project_name}</h1>
        {project.project_description && (
          <p className="text-muted-foreground mt-1">{project.project_description}</p>
        )}
        <p className="text-sm text-muted-foreground mt-2">
          {visibleCount} conversation(s)
        </p>
      </div>

      <div className="shrink-0 flex flex-wrap gap-2">
        <Button variant="primary" onClick={startChat} icon={<Plus className="w-4 h-4" />}>
          New Chat in Project
        </Button>
        {visibleCount > 0 && (
          <Button
            variant="secondary"
            onClick={() => setUnassignConfirmOpen(true)}
            icon={<FolderMinus className="w-4 h-4" />}
          >
            Unassign all
          </Button>
        )}
      </div>

      <div
        className="mt-6 flex-1 min-h-0 overflow-y-auto space-y-2"
        role="region"
        aria-label="Project conversations"
      >
        {projectChats.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground">
            <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p>No conversations yet. Start one above.</p>
          </div>
        ) : (
          projectChats.map((chat) => (
            <div
              key={chat.id}
              className="p-3 rounded-lg border border-border hover:bg-secondary/50 cursor-pointer transition-colors"
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
              <p className="font-medium">{chat.title}</p>
              <p className="text-sm text-muted-foreground truncate">{chat.preview}</p>
            </div>
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
