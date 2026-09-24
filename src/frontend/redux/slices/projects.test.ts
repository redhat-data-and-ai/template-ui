import { describe, expect, it, vi } from 'vitest';
import projectsReducer, {
  createProjectThunk,
  deleteProjectThunk,
  loadProjectsThunk,
  selectProjectById,
  setProjects,
  updateProjectThreadCount,
  type ProjectsState,
} from './projects';
import type { Project } from '../../types/chat';

vi.mock('../../services/projects-api', () => ({
  getProjects: vi.fn(async () => []),
  createProject: vi.fn(),
  updateProject: vi.fn(),
  deleteProject: vi.fn(),
  assignThreadToProject: vi.fn(),
  unassignAllThreadsFromProject: vi.fn(),
}));

function makeProject(id: string, overrides: Partial<Project> = {}): Project {
  return {
    project_id: id,
    project_name: `Project ${id}`,
    project_description: null,
    username: 'u1',
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
    thread_count: 0,
    ...overrides,
  };
}

function initialState(): ProjectsState {
  return projectsReducer(undefined, { type: '@@INIT' });
}

describe('projects slice', () => {
  it('setProjects replaces the list', () => {
    const s = projectsReducer(initialState(), setProjects([makeProject('p1')]));
    expect(s.projects).toHaveLength(1);
  });

  it('updateProjectThreadCount clamps at zero', () => {
    let s = projectsReducer(initialState(), setProjects([makeProject('p1', { thread_count: 1 })]));
    s = projectsReducer(s, updateProjectThreadCount({ projectId: 'p1', delta: -5 }));
    expect(s.projects[0].thread_count).toBe(0);
  });

  it('selectProjectById finds a project', () => {
    const state = { projects: projectsReducer(initialState(), setProjects([makeProject('p1')])) };
    expect(selectProjectById(state, 'p1')?.project_name).toBe('Project p1');
    expect(selectProjectById(state, 'missing')).toBeUndefined();
  });

  it('loadProjectsThunk.fulfilled stores projects', () => {
    const s = projectsReducer(
      { ...initialState(), isLoadingProjects: true },
      { type: loadProjectsThunk.fulfilled.type, payload: [makeProject('p1')] },
    );
    expect(s.projects[0].project_id).toBe('p1');
    expect(s.isLoadingProjects).toBe(false);
  });

  it('createProjectThunk.fulfilled prepends the project', () => {
    const existing = makeProject('p0');
    const created = makeProject('p1');
    const s = projectsReducer(
      { ...initialState(), projects: [existing] },
      { type: createProjectThunk.fulfilled.type, payload: created },
    );
    expect(s.projects[0].project_id).toBe('p1');
  });

  it('deleteProjectThunk.fulfilled removes the project', () => {
    const s = projectsReducer(
      { ...initialState(), projects: [makeProject('p1')] },
      { type: deleteProjectThunk.fulfilled.type, payload: { projectId: 'p1', deletedThreadIds: [] } },
    );
    expect(s.projects).toHaveLength(0);
  });

  it('unassignAllThreadsThunk.fulfilled zeros the thread count', () => {
    const s = projectsReducer(
      { ...initialState(), projects: [makeProject('p1', { thread_count: 3 })] },
      {
        type: 'projects/unassignAll/fulfilled',
        payload: { projectId: 'p1' },
      },
    );
    expect(s.projects[0].thread_count).toBe(0);
  });
});
