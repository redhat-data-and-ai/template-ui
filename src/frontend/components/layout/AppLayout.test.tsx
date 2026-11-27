import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createTestStore } from '../../test-utils/createTestStore';
import { addChat } from '../../redux/slices/chats';
import { setProjects } from '../../redux/slices/projects';
import { AppLayout } from './AppLayout';
import { HomePage } from '../../pages/HomePage';
import { chatStorage } from '../../services/chatStorage';
import { getAllThreadsByUserId, getThreadState } from '../../services/agent-rest';
import { getProjects, getThreadsByProject } from '../../services/projects-api';
import { markChatAsClientCreated, unmarkChatAsClientCreated } from '../../services/newChatTracker';

const mocks = vi.hoisted(() => ({
  deleteProject: vi.fn(),
  deleteThread: vi.fn(),
  getProjects: vi.fn(),
  getThreadsByProject: vi.fn(),
}));

vi.mock('../../hooks/useProjects', () => ({
  useProjects: () => ({
    sidebarProjects: [{ id: 'p1', name: 'Alpha', description: null, threadCount: 2 }],
    createProject: vi.fn(),
    updateProject: vi.fn(),
    deleteProject: mocks.deleteProject,
    assignThreadToProject: vi.fn(),
    unassignAllThreads: vi.fn(),
  }),
}));

vi.mock('../../hooks/useKeyboardShortcuts', () => ({
  useKeyboardShortcuts: vi.fn(),
}));

vi.mock('../../services/chatStorage', () => ({
  chatStorage: {
    loadChats: () => [],
    saveChats: vi.fn(),
    clearChats: vi.fn(),
  },
}));

vi.mock('../../services/agent-rest', () => ({
  getAllThreadsByUserId: vi.fn(async () => [
    {
      id: 'c1',
      title: 'Chat',
      updatedAt: '2026-01-01T00:00:00.000Z',
      project_id: 'p1',
      messages: [],
    },
  ]),
  getThreadState: vi.fn(async () => []),
  deleteThread: mocks.deleteThread,
}));

vi.mock('../../services/projects-api', () => ({
  getProjects: mocks.getProjects,
  getThreadsByProject: mocks.getThreadsByProject,
}));

vi.mock('../../lib/streaming/streamingManagerRegistry', () => ({
  releaseStreamingManager: vi.fn(),
}));

vi.mock('../Sidebar', () => ({
  Sidebar: ({
    onNewChat,
    onDeleteProject,
    onDeleteChat,
  }: {
    onNewChat: () => void;
    onDeleteProject: (id: string, options?: { keepThreads?: boolean }) => Promise<boolean>;
    onDeleteChat: (id: string) => void;
  }) => (
    <>
      <button type="button" onClick={() => onNewChat()}>new-chat</button>
      <button type="button" onClick={() => { void onDeleteProject('p1'); }}>
        delete-project
      </button>
      <button type="button" onClick={() => { void onDeleteChat('c1'); }}>
        delete-chat
      </button>
    </>
  ),
}));

const clientCreatedTestIds = new Set<string>();

beforeEach(() => {
  vi.mocked(getAllThreadsByUserId).mockReset();
  vi.mocked(getThreadState).mockReset();
  unmarkChatAsClientCreated('c1');
});

afterEach(() => {
  unmarkChatAsClientCreated('c1');
  for (const id of clientCreatedTestIds) unmarkChatAsClientCreated(id);
  clientCreatedTestIds.clear();
});

function seedStore() {
  const store = createTestStore();
  store.dispatch(
    setProjects([
      {
        project_id: 'p1',
        project_name: 'Alpha',
        project_description: null,
        username: 'u1',
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
        thread_count: 2,
      },
    ]),
  );
  store.dispatch(
    addChat({
      id: 'c1',
      title: 'Chat',
      timestamp: '2026-01-01T00:00:00.000Z',
      preview: '',
      messages: [],
      historicalActivities: {},
      feedback: {},
      project_id: 'p1',
    }),
  );
  return store;
}

function renderLayout(store: ReturnType<typeof createTestStore>) {
  return render(
    <Provider store={store}>
      <MemoryRouter>
        <AppLayout>
          <div>child</div>
        </AppLayout>
      </MemoryRouter>
    </Provider>,
  );
}

describe('AppLayout — project delete and chat count', () => {
  beforeEach(() => {
    mocks.deleteProject.mockReset();
    mocks.deleteThread.mockReset();
    mocks.getProjects.mockReset();
    mocks.getThreadsByProject.mockReset();
    mocks.getProjects.mockResolvedValue([]);
    mocks.getThreadsByProject.mockResolvedValue([]);
  });

  it.each([
    ['quick prompt', false],
    ['quick prompt', true],
    ['typed prompt', true],
    ['sidebar', true],
  ] as const)('preserves a %s chat through delayed startup history (stream connected: %s)', async (entry, streamConnected) => {
    let resolveHistory!: (history: []) => void;
    vi.mocked(getAllThreadsByUserId).mockReturnValueOnce(
      new Promise((resolve) => { resolveHistory = resolve; }),
    );
    const store = createTestStore();
    render(
      <Provider store={store}>
        <MemoryRouter>
          <AppLayout><HomePage /></AppLayout>
        </MemoryRouter>
      </Provider>,
    );

    const user = userEvent.setup();
    if (entry === 'sidebar') {
      await user.click(screen.getByRole('button', { name: 'new-chat' }));
    } else if (entry === 'typed prompt') {
      await user.type(screen.getByRole('textbox'), 'Hello');
      await user.click(screen.getByRole('button', { name: 'Send message' }));
    } else {
      await user.click(screen.getByRole('button', { name: 'Start chat: What can you do for me?' }));
    }
    const chatId = store.getState().chats.chats[0].id;
    clientCreatedTestIds.add(chatId);

    // A successful stream response clears this marker before history settles.
    if (streamConnected) unmarkChatAsClientCreated(chatId);
    resolveHistory([]);

    await waitFor(() => {
      expect(store.getState().chats.threadsListHydrated).toBe(true);
    });
    expect(store.getState().chats.chats.map((chat) => chat.id)).toContain(chatId);
  });

  it.each([false, true])('warms a backend thread instead of a new local chat (marker cleared: %s)', async (markerCleared) => {
    let resolveHistory!: (history: Array<{ id: string; updatedAt: string }>) => void;
    vi.mocked(getAllThreadsByUserId).mockReturnValueOnce(
      new Promise((resolve) => { resolveHistory = resolve; }),
    );
    const store = createTestStore();
    renderLayout(store);

    markChatAsClientCreated('c1');
    store.dispatch(addChat({
      id: 'c1',
      title: 'New Chat',
      timestamp: '2026-11-11T00:00:00.000Z',
      preview: '',
      messages: [],
      historicalActivities: {},
      feedback: {},
    }));
    if (markerCleared) unmarkChatAsClientCreated('c1');
    resolveHistory([{ id: 'backend-chat', updatedAt: '2026-01-01T00:00:00.000Z' }]);

    await waitFor(() => {
      expect(store.getState().chats.threadsListHydrated).toBe(true);
    });
    expect(store.getState().chats.chats.map((chat) => chat.id)).toContain('c1');
    expect(getThreadState).toHaveBeenCalledExactlyOnceWith('backend-chat');
  });

  it('preserves a chat already connecting at mount when its marker clears before history returns', async () => {
    let resolveHistory!: (history: []) => void;
    vi.mocked(getAllThreadsByUserId).mockReturnValueOnce(
      new Promise((resolve) => { resolveHistory = resolve; }),
    );
    const store = seedStore();
    markChatAsClientCreated('c1');
    renderLayout(store);

    unmarkChatAsClientCreated('c1');
    resolveHistory([]);

    await waitFor(() => {
      expect(store.getState().chats.threadsListHydrated).toBe(true);
    });
    expect(store.getState().chats.chats.map((chat) => chat.id)).toContain('c1');
  });

  it('still removes pre-existing local chats absent from startup history', async () => {
    vi.mocked(getAllThreadsByUserId).mockResolvedValueOnce([]);
    const store = seedStore();
    renderLayout(store);

    await waitFor(() => {
      expect(store.getState().chats.threadsListHydrated).toBe(true);
    });
    expect(store.getState().chats.chats).toEqual([]);
  });

  it('does not wipe local chats when the project is already gone', async () => {
    const user = userEvent.setup();
    mocks.deleteProject.mockResolvedValue({
      ok: true,
      deletedThreadIds: [],
      keepThreads: false,
      missing: true,
    });
    const store = seedStore();
    renderLayout(store);

    await user.click(screen.getByRole('button', { name: 'delete-project' }));

    await waitFor(() => {
      expect(mocks.deleteProject).toHaveBeenCalledWith('p1', { keepThreads: false });
    });
    expect(store.getState().chats.chats.some((c) => c.id === 'c1')).toBe(true);
    expect(store.getState().chats.chats.find((c) => c.id === 'c1')?.project_id).toBeNull();
  });

  it('persists an empty chat list after hard-delete of the last chats', async () => {
    const user = userEvent.setup();
    mocks.deleteProject.mockResolvedValue({
      ok: true,
      deletedThreadIds: ['c1'],
      keepThreads: false,
      missing: false,
    });
    const store = seedStore();
    renderLayout(store);

    await waitFor(() => {
      expect(store.getState().chats.chats.some((c) => c.id === 'c1')).toBe(true);
    });

    await user.click(screen.getByRole('button', { name: 'delete-project' }));

    await waitFor(() => {
      expect(store.getState().chats.chats).toHaveLength(0);
    });
    expect(chatStorage.clearChats).toHaveBeenCalled();
  });

  it('restores the project conversation count when server chat delete fails', async () => {
    const user = userEvent.setup();
    mocks.deleteThread.mockResolvedValue(false);
    const store = seedStore();
    renderLayout(store);

    await waitFor(() => {
      expect(store.getState().chats.chats.some((c) => c.id === 'c1')).toBe(true);
    });

    await user.click(screen.getByRole('button', { name: 'delete-chat' }));

    await waitFor(() => {
      expect(mocks.deleteThread).toHaveBeenCalledWith('c1');
    });
    expect(store.getState().projects.projects[0].thread_count).toBe(2);
    expect(store.getState().chats.chats.some((c) => c.id === 'c1')).toBe(false);
  });
});

describe('AppLayout — project thread hydration', () => {
  beforeEach(() => {
    mocks.getProjects.mockReset();
    mocks.getThreadsByProject.mockReset();
    vi.mocked(getAllThreadsByUserId).mockReset();
    vi.mocked(getAllThreadsByUserId).mockResolvedValue([
      {
        id: 'c1',
        title: 'Chat',
        updatedAt: '2026-01-01T00:00:00.000Z',
        project_id: 'p1',
        messages: [],
      },
    ]);
  });

  it('adds chats that search omitted but the project endpoint returned', async () => {
    mocks.getProjects.mockResolvedValue([
      {
        project_id: 'p1',
        project_name: 'Alpha',
        project_description: null,
        username: 'u1',
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
        thread_count: 2,
      },
    ]);
    mocks.getThreadsByProject.mockResolvedValue([
      {
        id: 'c-old',
        title: 'Old folder chat',
        messages: [],
        updatedAt: '2025-01-01T00:00:00.000Z',
        project_id: 'p1',
      },
    ]);
    const store = seedStore();
    renderLayout(store);

    await waitFor(() => {
      expect(store.getState().chats.chats.some((c) => c.id === 'c-old')).toBe(true);
    });
    expect(store.getState().chats.chats.find((c) => c.id === 'c-old')?.project_id).toBe('p1');
    expect(getProjects).toHaveBeenCalled();
    expect(getThreadsByProject).toHaveBeenCalledWith('p1');
  });
});
