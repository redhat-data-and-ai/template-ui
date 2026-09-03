import { useCallback, useEffect, useMemo } from 'react';
import { useAppDispatch, useAppSelector } from '../redux/hooks';
import { selectAllChats, updateChat } from '../redux/slices/chats';
import {
  loadProjectsThunk,
  createProjectThunk,
  updateProjectThunk,
  deleteProjectThunk,
  assignThreadToProjectThunk,
  unassignAllThreadsThunk,
  selectAllProjects,
  updateProjectThreadCount,
} from '../redux/slices/projects';
import { addToast } from '../redux/slices/toasts';
import { isClientCreatedChat } from '../services/newChatTracker';
import type { SidebarProject } from '../types/chat';

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  if (typeof err === 'object' && err !== null && 'message' in err) {
    return String((err as { message: unknown }).message);
  }
  return String(err);
}

export function useProjects() {
  const dispatch = useAppDispatch();
  const projects = useAppSelector(selectAllProjects);
  const chats = useAppSelector(selectAllChats);

  useEffect(() => {
    void dispatch(loadProjectsThunk())
      .unwrap()
      .catch(() => {
        dispatch(addToast({ title: 'Failed to load projects', variant: 'danger' }));
      });
  }, [dispatch]);

  const sidebarProjects: SidebarProject[] = useMemo(
    () =>
      projects.map((p) => ({
        id: p.project_id,
        name: p.project_name,
        description: p.project_description,
        threadCount: Math.max(
          p.thread_count,
          chats.filter((c) => c.project_id === p.project_id).length,
        ),
      })),
    [projects, chats],
  );

  const handleCreateProject = useCallback(
    async (name: string, description?: string): Promise<string | null> => {
      try {
        const result = await dispatch(createProjectThunk({ name, description })).unwrap();
        return result.project_id;
      } catch (err) {
        if (errorMessage(err).includes('already exists')) return null;
        throw err;
      }
    },
    [dispatch],
  );

  const handleUpdateProject = useCallback(
    async (projectId: string, name?: string, description?: string): Promise<boolean> => {
      try {
        await dispatch(updateProjectThunk({ projectId, name, description })).unwrap();
        return true;
      } catch (err) {
        if (errorMessage(err).includes('already exists')) return false;
        throw err;
      }
    },
    [dispatch],
  );

  const handleDeleteProject = useCallback(
    async (
      projectId: string,
      options?: { keepThreads?: boolean },
    ): Promise<{
      ok: boolean;
      deletedThreadIds: string[];
      keepThreads: boolean;
      missing: boolean;
    }> => {
      const keepThreads = options?.keepThreads === true;
      try {
        const result = await dispatch(
          deleteProjectThunk({ projectId, keepThreads }),
        ).unwrap();
        return {
          ok: true,
          deletedThreadIds: result.deletedThreadIds,
          keepThreads: result.keepThreads,
          missing: result.missing === true,
        };
      } catch {
        return { ok: false, deletedThreadIds: [], keepThreads, missing: false };
      }
    },
    [dispatch],
  );

  const handleUnassignAllThreads = useCallback(
    async (projectId: string): Promise<boolean> => {
      try {
        await dispatch(unassignAllThreadsThunk(projectId)).unwrap();
        return true;
      } catch {
        return false;
      }
    },
    [dispatch],
  );

  const handleAssignThread = useCallback(
    async (threadId: string, projectId: string | null): Promise<boolean> => {
      const chat = chats.find((c) => c.id === threadId);
      const prev = chat?.project_id ?? null;
      if (prev === projectId) return true;

      const bumpCounts = () => {
        if (prev) {
          dispatch(updateProjectThreadCount({ projectId: prev, delta: -1 }));
        }
        if (projectId) {
          dispatch(updateProjectThreadCount({ projectId, delta: 1 }));
        }
      };

      if (chat && isClientCreatedChat(threadId)) {
        dispatch(updateChat({ id: threadId, updates: { project_id: projectId } }));
        bumpCounts();
        return true;
      }

      try {
        await dispatch(assignThreadToProjectThunk({ threadId, projectId })).unwrap();
        bumpCounts();
        return true;
      } catch {
        dispatch(addToast({ title: 'Failed to move conversation', variant: 'danger' }));
        return false;
      }
    },
    [dispatch, chats],
  );

  return {
    sidebarProjects,
    createProject: handleCreateProject,
    updateProject: handleUpdateProject,
    deleteProject: handleDeleteProject,
    unassignAllThreads: handleUnassignAllThreads,
    assignThreadToProject: handleAssignThread,
  };
}
