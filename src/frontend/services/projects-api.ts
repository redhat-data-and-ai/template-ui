import { authenticatedFetch } from './authenticated-fetch';
import { buildAgentApiUrl } from '../lib/app-paths';
import type { Project } from '../types/chat';
import type { Thread } from './agent-rest';

export interface ProjectListResponse {
  projects: Project[];
}

export interface DeleteProjectResponse {
  deleted_thread_ids: string[];
  missing?: boolean;
}

export async function getProjects(): Promise<Project[]> {
  const resp = await authenticatedFetch(buildAgentApiUrl('/projects'));
  if (!resp.ok) {
    throw new Error(`Failed to load projects: ${resp.status}`);
  }
  const data: ProjectListResponse = await resp.json();
  return data.projects;
}

export async function createProject(
  name: string,
  description?: string,
): Promise<Project> {
  const resp = await authenticatedFetch(buildAgentApiUrl('/projects'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      project_name: name,
      project_description: description ?? null,
    }),
  });
  if (resp.status === 409) {
    throw new Error('A project with that name already exists');
  }
  if (!resp.ok) {
    throw new Error(`Failed to create project: ${resp.status}`);
  }
  return resp.json();
}

export async function updateProject(
  projectId: string,
  name?: string,
  description?: string,
): Promise<Project> {
  const body: Record<string, unknown> = {};
  if (name !== undefined) body.project_name = name;
  if (description !== undefined) body.project_description = description;

  const resp = await authenticatedFetch(
    buildAgentApiUrl(`/projects/${projectId}`),
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  );
  if (resp.status === 409) {
    throw new Error('A project with that name already exists');
  }
  if (!resp.ok) {
    throw new Error(`Failed to update project: ${resp.status}`);
  }
  return resp.json();
}

export interface UnassignAllResponse {
  status: string;
  message: string;
  project_id: string;
  threads_unassigned: number;
  unassigned_thread_ids: string[];
}

export async function deleteProject(
  projectId: string,
  options?: { keepThreads?: boolean },
): Promise<DeleteProjectResponse> {
  const path = options?.keepThreads
    ? `/projects/${projectId}?keep_threads=true`
    : `/projects/${projectId}`;
  const resp = await authenticatedFetch(
    buildAgentApiUrl(path),
    { method: 'DELETE' },
  );
  if (!resp.ok && resp.status !== 404) {
    throw new Error(`Failed to delete project: ${resp.status}`);
  }
  if (resp.status === 404) {
    return { deleted_thread_ids: [], missing: true };
  }
  const data = await resp.json();
  return { deleted_thread_ids: data.deleted_thread_ids ?? [], missing: false };
}

export async function assignThreadToProject(
  threadId: string,
  projectId: string | null,
): Promise<void> {
  const resp = await authenticatedFetch(
    buildAgentApiUrl('/projects/assign'),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        thread_id: threadId,
        project_id: projectId,
      }),
    },
  );
  if (!resp.ok) {
    throw new Error(`Failed to assign thread: ${resp.status}`);
  }
}

export async function getThreadsByProject(projectId: string): Promise<Thread[]> {
  const resp = await authenticatedFetch(
    buildAgentApiUrl(`/projects/${projectId}/threads`),
  );
  if (!resp.ok) {
    throw new Error(`Failed to load project threads: ${resp.status}`);
  }
  const rows: unknown = await resp.json();
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((t: { thread_id?: string }) => t.thread_id)
    .map((t: {
      thread_id: string;
      thread_title?: string | null;
      project_id?: string | null;
      updated_at?: string;
    }) => ({
      id: t.thread_id,
      title: t.thread_title ?? undefined,
      messages: [],
      updatedAt: t.updated_at,
      project_id: t.project_id ?? projectId,
    }));
}

export async function unassignAllThreadsFromProject(
  projectId: string,
): Promise<UnassignAllResponse> {
  const resp = await authenticatedFetch(
    buildAgentApiUrl(`/projects/${projectId}/unassign-all`),
    { method: 'POST' },
  );
  if (!resp.ok) {
    throw new Error(`Failed to unassign threads: ${resp.status}`);
  }
  return resp.json();
}
