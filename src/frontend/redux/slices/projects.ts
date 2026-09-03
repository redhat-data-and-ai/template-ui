import { createAsyncThunk, createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { Project } from '../../types/chat';
import {
  getProjects,
  createProject,
  updateProject as updateProjectApi,
  deleteProject as deleteProjectApi,
  assignThreadToProject as assignApi,
  unassignAllThreadsFromProject as unassignAllApi,
} from '../../services/projects-api';

export interface ProjectsState {
  projects: Project[];
  isLoadingProjects: boolean;
}

const initialState: ProjectsState = {
  projects: [],
  isLoadingProjects: false,
};

export const loadProjectsThunk = createAsyncThunk(
  'projects/load',
  async () => getProjects(),
);

export const createProjectThunk = createAsyncThunk(
  'projects/create',
  async ({ name, description }: { name: string; description?: string }) =>
    createProject(name, description),
);

export const updateProjectThunk = createAsyncThunk(
  'projects/update',
  async ({ projectId, name, description }: { projectId: string; name?: string; description?: string }) =>
    updateProjectApi(projectId, name, description),
);

export const deleteProjectThunk = createAsyncThunk(
  'projects/delete',
  async ({ projectId, keepThreads = false }: { projectId: string; keepThreads?: boolean }) => {
    const result = await deleteProjectApi(projectId, { keepThreads });
    return {
      projectId,
      deletedThreadIds: result.deleted_thread_ids,
      keepThreads,
      missing: result.missing === true,
    };
  },
);

export const unassignAllThreadsThunk = createAsyncThunk(
  'projects/unassignAll',
  async (projectId: string) => {
    await unassignAllApi(projectId);
    return { projectId };
  },
);

export const assignThreadToProjectThunk = createAsyncThunk(
  'projects/assignThread',
  async ({ threadId, projectId }: { threadId: string; projectId: string | null }) => {
    await assignApi(threadId, projectId);
    return { threadId, projectId };
  },
);

const projectsSlice = createSlice({
  name: 'projects',
  initialState,
  reducers: {
    setProjects(state, action: PayloadAction<Project[]>) {
      state.projects = action.payload;
    },
    updateProjectThreadCount(
      state,
      action: PayloadAction<{ projectId: string; delta: number }>,
    ) {
      const p = state.projects.find((pr) => pr.project_id === action.payload.projectId);
      if (p) {
        p.thread_count = Math.max(0, p.thread_count + action.payload.delta);
      }
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadProjectsThunk.pending, (state) => {
        state.isLoadingProjects = true;
      })
      .addCase(loadProjectsThunk.fulfilled, (state, action) => {
        state.projects = action.payload;
        state.isLoadingProjects = false;
      })
      .addCase(loadProjectsThunk.rejected, (state) => {
        state.isLoadingProjects = false;
      })

      .addCase(createProjectThunk.fulfilled, (state, action) => {
        state.projects.unshift(action.payload);
      })

      .addCase(updateProjectThunk.fulfilled, (state, action) => {
        const idx = state.projects.findIndex(
          (p) => p.project_id === action.payload.project_id,
        );
        if (idx !== -1) {
          state.projects[idx] = action.payload;
        }
      })

      .addCase(deleteProjectThunk.fulfilled, (state, action) => {
        state.projects = state.projects.filter(
          (p) => p.project_id !== action.payload.projectId,
        );
      })

      .addCase(unassignAllThreadsThunk.fulfilled, (state, action) => {
        const p = state.projects.find((pr) => pr.project_id === action.payload.projectId);
        if (p) {
          p.thread_count = 0;
        }
      });
  },
});

export const { setProjects, updateProjectThreadCount } = projectsSlice.actions;

export function selectAllProjects(state: { projects: ProjectsState }) {
  return state.projects.projects;
}

export function selectProjectById(
  state: { projects: ProjectsState },
  projectId: string,
) {
  return state.projects.projects.find((p) => p.project_id === projectId);
}

export function selectProjectsLoading(state: { projects: ProjectsState }) {
  return state.projects.isLoadingProjects;
}

export default projectsSlice.reducer;
