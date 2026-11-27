import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { act, render, screen, waitFor } from '@testing-library/react';
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

vi.mock('../sidebar/AppSidebar', () => ({
  AppSidebar: ({
    onNewChat,
    onDeleteProject,
    onDeleteChat,
    onSelectChat,
    isOpen,
  }: {
    isOpen: boolean;
    onSelectChat: (id: string) => void;
    onNewChat: () => void;
    onDeleteProject: (id: string, options?: { keepThreads?: boolean }) => Promise<boolean>;
    onDeleteChat: (id: string) => void;
  }) => (
    <div data-testid="sidebar" data-open={String(isOpen)}>
      <button type="button" onClick={() => onNewChat()}>new-chat</button>
      <button type="button" onClick={() => onSelectChat('c1')}>select-chat</button>
      <button type="button" onClick={() => { void onDeleteProject('p1'); }}>
        delete-project
      </button>
      <button type="button" onClick={() => { void onDeleteChat('c1'); }}>
        delete-chat
      </button>
    </div>
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

describe('AppLayout — disclaimer', () => {
  it('renders exactly one disclaimer, even around the home composer', async () => {
    vi.mocked(getAllThreadsByUserId).mockResolvedValue([]);
    render(
      <Provider store={createTestStore()}>
        <MemoryRouter>
          <AppLayout><HomePage /></AppLayout>
        </MemoryRouter>
      </Provider>,
    );
    expect(screen.getAllByText(/You are interacting with an AI tool/)).toHaveLength(1);
    await waitFor(() => expect(getAllThreadsByUserId).toHaveBeenCalled());
  });
});

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

function mockViewport(desktop: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: desktop,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      onchange: null,
      dispatchEvent: vi.fn(),
    }),
  });
}

describe('AppLayout — responsive sidebar', () => {
  beforeEach(() => {
    vi.mocked(getAllThreadsByUserId).mockResolvedValue([]);
    mocks.getProjects.mockResolvedValue([]);
    mocks.getThreadsByProject.mockResolvedValue([]);
  });
  afterEach(() => {
    delete (window as { matchMedia?: unknown }).matchMedia;
  });

  it('starts open on desktop', () => {
    mockViewport(true);
    renderLayout(createTestStore());
    expect(screen.getByTestId('sidebar')).toHaveAttribute('data-open', 'true');
    expect(document.querySelector('.app-sidebar-backdrop')).toBeNull();
  });

  it('starts closed below the xl breakpoint and opens from the toggle', async () => {
    mockViewport(false);
    renderLayout(createTestStore());
    expect(screen.getByTestId('sidebar')).toHaveAttribute('data-open', 'false');
    await userEvent.click(screen.getByRole('button', { name: 'Toggle navigation' }));
    expect(screen.getByTestId('sidebar')).toHaveAttribute('data-open', 'true');
    expect(document.querySelector('.app-sidebar-backdrop')).not.toBeNull();
  });

  it.each(['new-chat', 'select-chat'])('closes after %s, returning focus to the toggle', async (name) => {
    mockViewport(false);
    renderLayout(createTestStore());
    const toggle = screen.getByRole('button', { name: 'Toggle navigation' });
    await userEvent.click(toggle);
    await userEvent.click(screen.getByRole('button', { name }));
    expect(screen.getByTestId('sidebar')).toHaveAttribute('data-open', 'false');
    expect(toggle).toHaveFocus();
  });

  it('closes on Escape and on backdrop click', async () => {
    mockViewport(false);
    renderLayout(createTestStore());
    await userEvent.click(screen.getByRole('button', { name: 'Toggle navigation' }));
    await userEvent.keyboard('{Escape}');
    expect(screen.getByTestId('sidebar')).toHaveAttribute('data-open', 'false');
    await userEvent.click(screen.getByRole('button', { name: 'Toggle navigation' }));
    await userEvent.click(document.querySelector('.app-sidebar-backdrop') as HTMLElement);
    expect(screen.getByTestId('sidebar')).toHaveAttribute('data-open', 'false');
  });

  it('ignores Escape that is already handled or comes from an input or menu', async () => {
    mockViewport(false);
    renderLayout(createTestStore());
    await userEvent.click(screen.getByRole('button', { name: 'Toggle navigation' }));
    const sidebar = screen.getByTestId('sidebar');

    const input = document.createElement('input');
    sidebar.appendChild(input);
    input.focus();
    await userEvent.keyboard('{Escape}');
    expect(sidebar).toHaveAttribute('data-open', 'true');
    input.remove();

    const menu = document.createElement('div');
    menu.setAttribute('role', 'menu');
    sidebar.appendChild(menu);
    menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(sidebar).toHaveAttribute('data-open', 'true');
    menu.remove();

    const handled = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    handled.preventDefault();
    document.body.dispatchEvent(handled);
    expect(sidebar).toHaveAttribute('data-open', 'true');

    await userEvent.keyboard('{Escape}');
    expect(sidebar).toHaveAttribute('data-open', 'false');
  });

  it('stays open after navigation on desktop', async () => {
    mockViewport(true);
    renderLayout(createTestStore());
    await userEvent.click(screen.getByRole('button', { name: 'select-chat' }));
    expect(screen.getByTestId('sidebar')).toHaveAttribute('data-open', 'true');
  });

  it('returns focus to the toggle when the user closes the overlay with Escape', async () => {
    mockViewport(false);
    renderLayout(createTestStore());
    const toggle = screen.getByRole('button', { name: 'Toggle navigation' });
    await userEvent.click(toggle);
    await userEvent.keyboard('{Escape}');
    expect(toggle).toHaveFocus();
    await userEvent.click(toggle);
    await userEvent.click(toggle);
    expect(screen.getByTestId('sidebar')).toHaveAttribute('data-open', 'false');
    expect(toggle).toHaveFocus();
  });

  it('keeps focus in the composer and the overlay closed when crossing desktop to narrow', async () => {
    const listeners = new Set<() => void>();
    let desktop = true;
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: (query: string) => ({
        get matches() { return desktop; },
        media: query,
        addEventListener: (_: string, cb: () => void) => listeners.add(cb),
        removeEventListener: (_: string, cb: () => void) => listeners.delete(cb),
      }),
    });
    const seen: string[] = [];
    const observer = new MutationObserver(() => {
      seen.push(`${document.querySelector('.app-sidebar-backdrop') ? 'backdrop' : ''}${document.querySelector('[data-testid="sidebar"]')?.getAttribute('data-open')}`);
    });
    renderLayout(createTestStore());
    const composer = document.createElement('textarea');
    document.body.appendChild(composer);
    composer.focus();
    observer.observe(document.body, { subtree: true, attributes: true, childList: true });
    expect(screen.getByTestId('sidebar')).toHaveAttribute('data-open', 'true');
    act(() => {
      desktop = false;
      listeners.forEach((cb) => cb());
    });
    observer.disconnect();
    expect(composer).toHaveFocus();
    composer.remove();
    expect(screen.getByTestId('sidebar')).toHaveAttribute('data-open', 'false');
    expect(document.querySelector('.app-sidebar-backdrop')).toBeNull();
    expect(seen.some((v) => v.includes('backdrop') || v.endsWith('true'))).toBe(false);
  });
});
