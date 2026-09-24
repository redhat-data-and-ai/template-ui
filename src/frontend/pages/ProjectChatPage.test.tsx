import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@testing-library/react';
import { createTestStore } from '../test-utils/createTestStore';
import { addChat } from '../redux/slices/chats';
import { setProjects } from '../redux/slices/projects';
import { ProjectChatPage } from './ProjectChatPage';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const project = {
  project_id: 'p1',
  project_name: 'Alpha',
  project_description: 'Research',
  username: 'dev',
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
  thread_count: 0,
};

function renderPage() {
  const store = createTestStore();
  store.dispatch(setProjects([project]));
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={['/project/p1']}>
        <Routes>
          <Route path="/project/:projectId" element={<ProjectChatPage />} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  );
  return store;
}

describe('ProjectChatPage', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
  });

  it('renders a new-chat-in-project button without a prompt textbox', () => {
    renderPage();
    expect(screen.getByRole('button', { name: /new chat in project/i })).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('New Chat in Project opens an empty project chat', async () => {
    const user = userEvent.setup();
    const store = renderPage();
    await user.click(screen.getByRole('button', { name: /new chat in project/i }));
    expect(mockNavigate).toHaveBeenCalledWith(
      expect.stringMatching(/^\/chat\/[^/?]+$/),
      expect.objectContaining({ state: { newChat: true } }),
    );
    expect(store.getState().chats.chats[0].project_id).toBe('p1');
  });

  it('shows Unassign all when the project has conversations', () => {
    const store = createTestStore();
    store.dispatch(setProjects([{ ...project, thread_count: 2 }]));
    render(
      <Provider store={store}>
        <MemoryRouter initialEntries={['/project/p1']}>
          <Routes>
            <Route path="/project/:projectId" element={<ProjectChatPage />} />
          </Routes>
        </MemoryRouter>
      </Provider>,
    );
    expect(screen.getByRole('button', { name: /unassign all/i })).toBeInTheDocument();
  });

  it('hides Unassign all when there are no conversations', () => {
    renderPage();
    expect(screen.queryByRole('button', { name: /unassign all/i })).not.toBeInTheDocument();
  });

  it('shows Unassign all when local chats exist even if the server count is 0', () => {
    const store = createTestStore();
    store.dispatch(setProjects([project]));
    store.dispatch(
      addChat({
        id: 'c1',
        title: 'Local chat',
        timestamp: '2026-01-01T00:00:00.000Z',
        preview: 'hello',
        messages: [],
        historicalActivities: {},
        feedback: {},
        project_id: 'p1',
      }),
    );
    render(
      <Provider store={store}>
        <MemoryRouter initialEntries={['/project/p1']}>
          <Routes>
            <Route path="/project/:projectId" element={<ProjectChatPage />} />
          </Routes>
        </MemoryRouter>
      </Provider>,
    );
    expect(screen.getByText(/1 conversation/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /unassign all/i })).toBeInTheDocument();
  });

  it('asks before unassigning all conversations', async () => {
    const user = userEvent.setup();
    const store = createTestStore();
    store.dispatch(setProjects([{ ...project, thread_count: 2 }]));
    render(
      <Provider store={store}>
        <MemoryRouter initialEntries={['/project/p1']}>
          <Routes>
            <Route path="/project/:projectId" element={<ProjectChatPage />} />
          </Routes>
        </MemoryRouter>
      </Provider>,
    );
    await user.click(screen.getByRole('button', { name: /unassign all/i }));
    expect(
      screen.getByRole('dialog', { name: /unassign all conversations/i }),
    ).toBeInTheDocument();
  });

  it('scrolls the conversation list inside the page', () => {
    const store = createTestStore();
    store.dispatch(setProjects([{ ...project, thread_count: 1 }]));
    store.dispatch(
      addChat({
        id: 'c1',
        title: 'Old chat',
        timestamp: '2026-01-01T00:00:00.000Z',
        preview: 'hello',
        messages: [],
        historicalActivities: {},
        feedback: {},
        project_id: 'p1',
      }),
    );
    render(
      <Provider store={store}>
        <MemoryRouter initialEntries={['/project/p1']}>
          <Routes>
            <Route path="/project/:projectId" element={<ProjectChatPage />} />
          </Routes>
        </MemoryRouter>
      </Provider>,
    );

    const list = screen.getByRole('region', { name: /project conversations/i });
    expect(list.className).toMatch(/overflow-y-auto/);
    expect(list.className).toMatch(/min-h-0/);
    expect(screen.getByRole('button', { name: /old chat/i })).toBeInTheDocument();
  });
});
