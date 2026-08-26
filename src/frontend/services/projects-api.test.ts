import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./authenticated-fetch', () => ({
  authenticatedFetch: vi.fn(),
}));

vi.mock('../lib/app-paths', () => ({
  buildAgentApiUrl: (path: string) => `/api/proxy/agent${path}`,
}));

import { authenticatedFetch } from './authenticated-fetch';
import {
  assignThreadToProject,
  createProject,
  deleteProject,
  getProjects,
  getThreadsByProject,
  unassignAllThreadsFromProject,
  updateProject,
} from './projects-api';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('projects-api', () => {
  beforeEach(() => {
    vi.mocked(authenticatedFetch).mockReset();
  });

  it('getThreadsByProject maps project thread rows', async () => {
    vi.mocked(authenticatedFetch).mockResolvedValue(
      jsonResponse([
        {
          thread_id: 'th1',
          thread_title: 'Old chat',
          project_id: 'p1',
          updated_at: '2026-01-01T00:00:00.000Z',
        },
      ]),
    );
    const threads = await getThreadsByProject('p1');
    expect(authenticatedFetch).toHaveBeenCalledWith(
      '/api/proxy/agent/projects/p1/threads',
    );
    expect(threads).toEqual([
      {
        id: 'th1',
        title: 'Old chat',
        messages: [],
        updatedAt: '2026-01-01T00:00:00.000Z',
        project_id: 'p1',
      },
    ]);
  });

  it('getProjects returns the projects array', async () => {
    vi.mocked(authenticatedFetch).mockResolvedValue(
      jsonResponse({ projects: [{ project_id: 'p1', project_name: 'Alpha' }] }),
    );
    const projects = await getProjects();
    expect(authenticatedFetch).toHaveBeenCalledWith('/api/proxy/agent/projects');
    expect(projects[0].project_id).toBe('p1');
  });

  it('createProject posts name and description', async () => {
    vi.mocked(authenticatedFetch).mockResolvedValue(
      jsonResponse({ project_id: 'p1', project_name: 'Alpha' }, 201),
    );
    await createProject('Alpha', 'desc');
    expect(authenticatedFetch).toHaveBeenCalledWith(
      '/api/proxy/agent/projects',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          project_name: 'Alpha',
          project_description: 'desc',
        }),
      }),
    );
  });

  it('createProject throws on 409', async () => {
    vi.mocked(authenticatedFetch).mockResolvedValue(jsonResponse({}, 409));
    await expect(createProject('Alpha')).rejects.toThrow(/already exists/);
  });

  it('updateProject sends a patch body', async () => {
    vi.mocked(authenticatedFetch).mockResolvedValue(
      jsonResponse({ project_id: 'p1', project_name: 'Beta' }),
    );
    await updateProject('p1', 'Beta');
    expect(authenticatedFetch).toHaveBeenCalledWith(
      '/api/proxy/agent/projects/p1',
      expect.objectContaining({ method: 'PATCH' }),
    );
  });

  it('deleteProject treats 404 as empty deleted ids', async () => {
    vi.mocked(authenticatedFetch).mockResolvedValue(new Response(null, { status: 404 }));
    const result = await deleteProject('p1');
    expect(result.deleted_thread_ids).toEqual([]);
    expect(result.missing).toBe(true);
  });

  it('assignThreadToProject posts thread and project ids', async () => {
    vi.mocked(authenticatedFetch).mockResolvedValue(jsonResponse({ status: 'success' }));
    await assignThreadToProject('th1', 'p1');
    expect(authenticatedFetch).toHaveBeenCalledWith(
      '/api/proxy/agent/projects/assign',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ thread_id: 'th1', project_id: 'p1' }),
      }),
    );
  });

  it('assignThreadToProject includes status on failure', async () => {
    vi.mocked(authenticatedFetch).mockResolvedValue(
      jsonResponse({ detail: 'Thread not found' }, 404),
    );
    await expect(assignThreadToProject('th1', 'p1')).rejects.toThrow(
      'Failed to assign thread: 404',
    );
  });

  it('unassignAllThreadsFromProject posts to unassign-all', async () => {
    vi.mocked(authenticatedFetch).mockResolvedValue(
      jsonResponse({
        status: 'success',
        project_id: 'p1',
        threads_unassigned: 2,
        unassigned_thread_ids: ['t1', 't2'],
      }),
    );
    const result = await unassignAllThreadsFromProject('p1');
    expect(authenticatedFetch).toHaveBeenCalledWith(
      '/api/proxy/agent/projects/p1/unassign-all',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(result.threads_unassigned).toBe(2);
    expect(result.unassigned_thread_ids).toEqual(['t1', 't2']);
  });

  it('deleteProject passes keep_threads when requested', async () => {
    vi.mocked(authenticatedFetch).mockResolvedValue(
      jsonResponse({ deleted_thread_ids: [] }),
    );
    const result = await deleteProject('p1', { keepThreads: true });
    expect(authenticatedFetch).toHaveBeenCalledWith(
      '/api/proxy/agent/projects/p1?keep_threads=true',
      expect.objectContaining({ method: 'DELETE' }),
    );
    expect(result.deleted_thread_ids).toEqual([]);
  });

  it('deleteProject marks a successful delete as not missing', async () => {
    vi.mocked(authenticatedFetch).mockResolvedValue(
      jsonResponse({ deleted_thread_ids: ['t1'] }),
    );
    const result = await deleteProject('p1');
    expect(result.deleted_thread_ids).toEqual(['t1']);
    expect(result.missing).toBe(false);
  });
});
