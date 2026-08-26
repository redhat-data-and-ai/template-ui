import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createTestStore } from '../../test-utils/createTestStore';
import { addChat } from '../../redux/slices/chats';
import { setProjects } from '../../redux/slices/projects';
import { ProfileSection } from './ProfileSection';
import * as projectsApi from '../../services/projects-api';

vi.mock('../../services/chatStorage', () => ({
  chatStorage: {
    clearChats: vi.fn(),
  },
}));

vi.mock('../../services/agent-rest', () => ({
  deleteThread: vi.fn(async () => true),
}));

vi.mock('../../lib/streaming/streamingManagerRegistry', () => ({
  releaseStreamingManager: vi.fn(),
}));

vi.mock('../../services/projects-api', () => ({
  getProjects: vi.fn(async () => []),
  createProject: vi.fn(),
  updateProject: vi.fn(),
  deleteProject: vi.fn(),
  assignThreadToProject: vi.fn(),
  unassignAllThreadsFromProject: vi.fn(),
  getThreadsByProject: vi.fn(async () => []),
}));

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

describe('ProfileSection — delete all', () => {
  beforeEach(() => {
    Object.assign(window, {
      USER_DATA: { displayName: 'Dev', preferred_username: 'dev' },
    });
    vi.mocked(projectsApi.getProjects).mockReset();
  });

  it('reloads project conversation counts from the server after delete all', async () => {
    vi.mocked(projectsApi.getProjects).mockResolvedValue([
      {
        project_id: 'p1',
        project_name: 'Alpha',
        project_description: null,
        username: 'u1',
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
        thread_count: 3,
      },
    ]);
    const user = userEvent.setup();
    const store = seedStore();
    render(
      <Provider store={store}>
        <MemoryRouter>
          <ProfileSection />
        </MemoryRouter>
      </Provider>,
    );

    await user.click(screen.getByRole('button', { name: 'Delete all' }));
    await user.click(screen.getByRole('button', { name: 'Delete all' }));

    await waitFor(() => {
      expect(projectsApi.getProjects).toHaveBeenCalled();
      expect(store.getState().projects.projects[0].thread_count).toBe(3);
    });
  });
});
