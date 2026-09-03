import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { createTestStore } from '../test-utils/createTestStore';
import { addChat } from '../redux/slices/chats';
import { selectToasts } from '../redux/slices/toasts';
import * as projectsApi from '../services/projects-api';
import { markChatAsClientCreated, unmarkChatAsClientCreated } from '../services/newChatTracker';
import { useProjects } from './useProjects';

vi.mock('../services/projects-api', () => ({
  getProjects: vi.fn(async () => []),
  createProject: vi.fn(),
  updateProject: vi.fn(),
  deleteProject: vi.fn(),
  assignThreadToProject: vi.fn(),
  unassignAllThreadsFromProject: vi.fn(),
}));

function wrapperFor(store: ReturnType<typeof createTestStore>) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(Provider, { store }, children);
  };
}

describe('useProjects', () => {
  beforeEach(() => {
    vi.mocked(projectsApi.getProjects).mockReset();
    vi.mocked(projectsApi.getProjects).mockResolvedValue([]);
    vi.mocked(projectsApi.createProject).mockReset();
    vi.mocked(projectsApi.assignThreadToProject).mockReset();
    vi.mocked(projectsApi.deleteProject).mockReset();
  });

  it('toasts when loading projects fails', async () => {
    vi.mocked(projectsApi.getProjects).mockRejectedValue(new Error('network'));
    const store = createTestStore();
    renderHook(() => useProjects(), { wrapper: wrapperFor(store) });

    await waitFor(() => {
      expect(
        selectToasts(store.getState()).some((t) => t.title === 'Failed to load projects'),
      ).toBe(true);
    });
  });

  it('toasts when assigning a conversation fails', async () => {
    vi.mocked(projectsApi.assignThreadToProject).mockRejectedValue(new Error('fail'));
    const store = createTestStore();
    store.dispatch(
      addChat({
        id: 'c1',
        title: 'Chat',
        timestamp: new Date().toISOString(),
        preview: '',
        messages: [],
        historicalActivities: {},
        feedback: {},
        project_id: null,
      }),
    );
    const { result } = renderHook(() => useProjects(), { wrapper: wrapperFor(store) });

    await act(async () => {
      const ok = await result.current.assignThreadToProject('c1', 'p1');
      expect(ok).toBe(false);
    });

    expect(
      selectToasts(store.getState()).some((t) => t.title === 'Failed to move conversation'),
    ).toBe(true);
  });

  it('assigns a never-streamed new chat locally without calling the API', async () => {
    markChatAsClientCreated('new-1');
    const store = createTestStore();
    store.dispatch(
      addChat({
        id: 'new-1',
        title: 'New Chat',
        timestamp: new Date().toISOString(),
        preview: '',
        messages: [],
        historicalActivities: {},
        feedback: {},
        project_id: null,
      }),
    );
    const { result } = renderHook(() => useProjects(), { wrapper: wrapperFor(store) });

    await act(async () => {
      const ok = await result.current.assignThreadToProject('new-1', 'p1');
      expect(ok).toBe(true);
    });

    expect(projectsApi.assignThreadToProject).not.toHaveBeenCalled();
    expect(store.getState().chats.chats[0].project_id).toBe('p1');
    expect(
      selectToasts(store.getState()).some((t) => t.title === 'Failed to move conversation'),
    ).toBe(false);
  });

  it('unassigns a never-streamed new chat locally without calling the API', async () => {
    markChatAsClientCreated('new-2');
    const store = createTestStore();
    store.dispatch(
      addChat({
        id: 'new-2',
        title: 'New Chat',
        timestamp: new Date().toISOString(),
        preview: '',
        messages: [],
        historicalActivities: {},
        feedback: {},
        project_id: 'p1',
      }),
    );
    const { result } = renderHook(() => useProjects(), { wrapper: wrapperFor(store) });

    await act(async () => {
      const ok = await result.current.assignThreadToProject('new-2', null);
      expect(ok).toBe(true);
    });

    expect(projectsApi.assignThreadToProject).not.toHaveBeenCalled();
    expect(store.getState().chats.chats[0].project_id).toBeNull();
  });

  it('assigns a client-created chat locally even after it has a message', async () => {
    markChatAsClientCreated('new-3');
    const store = createTestStore();
    store.dispatch(
      addChat({
        id: 'new-3',
        title: 'Chat',
        timestamp: new Date().toISOString(),
        preview: 'hello',
        messages: [{ type: 'human', content: 'hello', id: 'm1' }],
        historicalActivities: {},
        feedback: {},
        project_id: null,
      }),
    );
    const { result } = renderHook(() => useProjects(), { wrapper: wrapperFor(store) });

    await act(async () => {
      const ok = await result.current.assignThreadToProject('new-3', 'p1');
      expect(ok).toBe(true);
    });

    expect(projectsApi.assignThreadToProject).not.toHaveBeenCalled();
    expect(store.getState().chats.chats[0].project_id).toBe('p1');
  });

  it('calls the API after the chat is unmarked as client-created', async () => {
    markChatAsClientCreated('new-4');
    unmarkChatAsClientCreated('new-4');
    vi.mocked(projectsApi.assignThreadToProject).mockResolvedValue();
    const store = createTestStore();
    store.dispatch(
      addChat({
        id: 'new-4',
        title: 'Chat',
        timestamp: new Date().toISOString(),
        preview: 'hello',
        messages: [{ type: 'human', content: 'hello', id: 'm1' }],
        historicalActivities: {},
        feedback: {},
        project_id: null,
      }),
    );
    const { result } = renderHook(() => useProjects(), { wrapper: wrapperFor(store) });

    await act(async () => {
      const ok = await result.current.assignThreadToProject('new-4', 'p1');
      expect(ok).toBe(true);
    });

    expect(projectsApi.assignThreadToProject).toHaveBeenCalledWith('new-4', 'p1');
  });

  it('reports missing when delete returns 404', async () => {
    vi.mocked(projectsApi.deleteProject).mockResolvedValue({
      deleted_thread_ids: [],
      missing: true,
    });
    const store = createTestStore();
    const { result } = renderHook(() => useProjects(), { wrapper: wrapperFor(store) });

    let deleted: Awaited<ReturnType<typeof result.current.deleteProject>> | undefined;
    await act(async () => {
      deleted = await result.current.deleteProject('p1');
    });

    expect(deleted).toEqual({
      ok: true,
      deletedThreadIds: [],
      keepThreads: false,
      missing: true,
    });
  });

  it('counts never-streamed local chats in the sidebar badge', async () => {
    vi.mocked(projectsApi.getProjects).mockResolvedValue([
      {
        project_id: 'p1',
        project_name: 'Alpha',
        project_description: null,
        username: 'u1',
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
        thread_count: 0,
      },
    ]);
    const store = createTestStore();
    store.dispatch(
      addChat({
        id: 'c1',
        title: 'Chat',
        timestamp: new Date().toISOString(),
        preview: '',
        messages: [],
        historicalActivities: {},
        feedback: {},
        project_id: 'p1',
      }),
    );
    const { result } = renderHook(() => useProjects(), { wrapper: wrapperFor(store) });

    await waitFor(() => {
      expect(result.current.sidebarProjects[0]?.threadCount).toBe(1);
    });
  });

  it('rethrows create errors that are not duplicate-name conflicts', async () => {
    vi.mocked(projectsApi.createProject).mockRejectedValue(
      new Error('Failed to create project: 500'),
    );
    const store = createTestStore();
    const { result } = renderHook(() => useProjects(), { wrapper: wrapperFor(store) });

    await act(async () => {
      await expect(result.current.createProject('Alpha')).rejects.toThrow(/Failed to create/);
    });
  });
});
