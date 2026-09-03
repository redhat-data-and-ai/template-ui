import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../test-utils/render';
import { Sidebar } from './Sidebar';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const sidebarProps = {
  chatHistory: [],
  onNewChat: vi.fn(),
  onSelectChat: vi.fn(),
  onDeleteChat: vi.fn(),
  onRenameChat: vi.fn(),
};

describe('Sidebar — create project', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
  });

  it('opens the project page after a project is created', async () => {
    const user = userEvent.setup();
    const onCreateProject = vi.fn().mockResolvedValue('proj-1');

    renderWithProviders(
      <Sidebar {...sidebarProps} onCreateProject={onCreateProject} />,
    );

    await user.click(screen.getByRole('button', { name: /create project/i }));
    const dialog = await screen.findByRole('dialog', { name: /new project/i });
    const nameInput = dialog.querySelector('#project-name');
    expect(nameInput).toBeTruthy();
    await user.type(nameInput as HTMLElement, 'Alpha');
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => {
      expect(onCreateProject).toHaveBeenCalledWith('Alpha', '');
      expect(mockNavigate).toHaveBeenCalledWith('/project/proj-1');
    });
  });

  it('does not navigate when create fails', async () => {
    const user = userEvent.setup();
    const onCreateProject = vi.fn().mockResolvedValue(null);

    renderWithProviders(
      <Sidebar {...sidebarProps} onCreateProject={onCreateProject} />,
    );

    await user.click(screen.getByRole('button', { name: /create project/i }));
    const dialog = await screen.findByRole('dialog', { name: /new project/i });
    const nameInput = dialog.querySelector('#project-name');
    expect(nameInput).toBeTruthy();
    await user.type(nameInput as HTMLElement, 'Alpha');
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => {
      expect(onCreateProject).toHaveBeenCalled();
    });
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('shows a generic save error when create throws', async () => {
    const user = userEvent.setup();
    const onCreateProject = vi.fn().mockRejectedValue(new Error('network'));

    renderWithProviders(
      <Sidebar {...sidebarProps} onCreateProject={onCreateProject} />,
    );

    await user.click(screen.getByRole('button', { name: /create project/i }));
    const dialog = await screen.findByRole('dialog', { name: /new project/i });
    const nameInput = dialog.querySelector('#project-name');
    await user.type(nameInput as HTMLElement, 'Alpha');
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not save project/i);
    expect(screen.getByRole('dialog', { name: /new project/i })).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('shows a red warning and stays open when the name already exists', async () => {
    const user = userEvent.setup();
    const onCreateProject = vi.fn();

    renderWithProviders(
      <Sidebar
        {...sidebarProps}
        onCreateProject={onCreateProject}
        projects={[
          { id: 'p1', name: 'Alpha', description: null, threadCount: 0 },
        ]}
      />,
    );

    await user.click(screen.getByRole('button', { name: /create project/i }));
    const dialog = await screen.findByRole('dialog', { name: /new project/i });
    const nameInput = dialog.querySelector('#project-name');
    await user.type(nameInput as HTMLElement, 'Alpha');
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    const warning = await screen.findByRole('alert');
    expect(warning).toHaveTextContent(/already exists/i);
    expect(warning.className).toMatch(/destructive|danger|red/i);
    expect(onCreateProject).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: /new project/i })).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});

describe('Sidebar — delete project', () => {
  const projects = [
    { id: 'p1', name: 'Alpha', description: null, threadCount: 2 },
  ];

  it('offers Unassign and delete and keeps the project until confirmed', async () => {
    const user = userEvent.setup();
    const onDeleteProject = vi.fn().mockResolvedValue(true);

    renderWithProviders(
      <Sidebar {...sidebarProps} projects={projects} onDeleteProject={onDeleteProject} />,
    );

    await user.click(screen.getByRole('button', { name: /delete project: alpha/i }));
    const dialog = await screen.findByRole('dialog', { name: /delete project/i });
    expect(dialog).toHaveTextContent(/unassign/i);

    await user.click(screen.getByRole('button', { name: /unassign and delete/i }));
    await waitFor(() => {
      expect(onDeleteProject).toHaveBeenCalledWith('p1', { keepThreads: true });
    });
  });

  it('Delete still permanently removes conversations', async () => {
    const user = userEvent.setup();
    const onDeleteProject = vi.fn().mockResolvedValue(true);

    renderWithProviders(
      <Sidebar {...sidebarProps} projects={projects} onDeleteProject={onDeleteProject} />,
    );

    await user.click(screen.getByRole('button', { name: /delete project: alpha/i }));
    await user.click(screen.getByRole('button', { name: /^delete$/i }));
    await waitFor(() => {
      expect(onDeleteProject).toHaveBeenCalledWith('p1');
    });
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /delete project/i })).not.toBeInTheDocument();
    });
  });

  it('keeps the delete dialog open when delete fails', async () => {
    const user = userEvent.setup();
    const onDeleteProject = vi.fn().mockResolvedValue(false);

    renderWithProviders(
      <Sidebar {...sidebarProps} projects={projects} onDeleteProject={onDeleteProject} />,
    );

    await user.click(screen.getByRole('button', { name: /delete project: alpha/i }));
    await user.click(screen.getByRole('button', { name: /^delete$/i }));
    await waitFor(() => {
      expect(onDeleteProject).toHaveBeenCalledWith('p1');
    });
    expect(screen.getByRole('dialog', { name: /delete project/i })).toBeInTheDocument();
  });

  it('unassign-all icon on the project row unassigns chats', async () => {
    const user = userEvent.setup();
    const onUnassignAll = vi.fn().mockResolvedValue(true);

    renderWithProviders(
      <Sidebar
        {...sidebarProps}
        projects={projects}
        onUnassignAll={onUnassignAll}
      />,
    );

    await user.click(screen.getByRole('button', { name: /unassign all chats from alpha/i }));
    expect(onUnassignAll).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: /^unassign$/i }));
    await waitFor(() => {
      expect(onUnassignAll).toHaveBeenCalledWith('p1');
    });
  });

  it('hides the unassign-all icon when the project has no chats', () => {
    renderWithProviders(
      <Sidebar
        {...sidebarProps}
        projects={[{ id: 'p1', name: 'Alpha', description: null, threadCount: 0 }]}
        onUnassignAll={vi.fn()}
      />,
    );

    expect(
      screen.queryByRole('button', { name: /unassign all chats from alpha/i }),
    ).not.toBeInTheDocument();
  });
});

const sampleChat = {
  id: 'c1',
  title: 'Research thread',
  timestamp: new Date('2026-01-01'),
  preview: 'hello',
};

describe('Sidebar — add chat to project', () => {
  it('assigns an unassigned chat from the add-to-project menu', async () => {
    const user = userEvent.setup();
    const onAssignThread = vi.fn().mockResolvedValue(true);

    renderWithProviders(
      <Sidebar
        {...sidebarProps}
        chatHistory={[sampleChat]}
        projects={[{ id: 'p1', name: 'Alpha', description: null, threadCount: 0 }]}
        onAssignThread={onAssignThread}
      />,
    );

    await user.click(screen.getByRole('button', { name: /add to project: research thread/i }));
    await user.click(await screen.findByRole('menuitem', { name: 'Alpha' }));

    await waitFor(() => {
      expect(onAssignThread).toHaveBeenCalledWith('c1', 'p1');
    });
  });

  it('lists a chat whose project no longer exists under Chats', () => {
    renderWithProviders(
      <Sidebar
        {...sidebarProps}
        chatHistory={[{ ...sampleChat, project_id: 'deleted-project' }]}
        projects={[{ id: 'p1', name: 'Alpha', description: null, threadCount: 0 }]}
        onAssignThread={vi.fn()}
      />,
    );

    expect(screen.getByText('Research thread')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: /alpha chats/i })).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /add to project: research thread/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /unassign chat: research thread/i }),
    ).not.toBeInTheDocument();
  });

  it('gives the project chat list a fixed height that can scroll', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <Sidebar
        {...sidebarProps}
        chatHistory={[{ ...sampleChat, project_id: 'p1' }]}
        projects={[{ id: 'p1', name: 'Alpha', description: null, threadCount: 1 }]}
      />,
    );

    await user.click(screen.getByRole('button', { name: /expand alpha/i }));

    const list = screen.getByRole('list', { name: /alpha chats/i });
    expect(list.className).toMatch(/max-h-48/);
    expect(list.className).toMatch(/overflow-y-auto/);
  });

  it('unassigns a project chat instead of offering add-to-project', async () => {
    const user = userEvent.setup();
    const onAssignThread = vi.fn().mockResolvedValue(true);

    renderWithProviders(
      <Sidebar
        {...sidebarProps}
        chatHistory={[{ ...sampleChat, project_id: 'p1' }]}
        projects={[{ id: 'p1', name: 'Alpha', description: null, threadCount: 1 }]}
        onAssignThread={onAssignThread}
      />,
    );

    await user.click(screen.getByRole('button', { name: /expand alpha/i }));

    expect(
      screen.queryByRole('button', { name: /add to project: research thread/i }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /unassign chat: research thread/i }));

    await waitFor(() => {
      expect(onAssignThread).toHaveBeenCalledWith('c1', null);
    });
  });
});
