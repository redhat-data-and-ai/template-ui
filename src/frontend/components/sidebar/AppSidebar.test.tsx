import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test-utils/render';
import { AppSidebar } from './AppSidebar';

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

describe('AppSidebar — create project', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
  });

  it('opens the project page after a project is created', async () => {
    const user = userEvent.setup();
    const onCreateProject = vi.fn().mockResolvedValue('proj-1');

    renderWithProviders(
      <AppSidebar isOpen {...sidebarProps} onCreateProject={onCreateProject} />,
    );

    await user.click(screen.getByRole('button', { name: /new project/i }));
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
      <AppSidebar isOpen {...sidebarProps} onCreateProject={onCreateProject} />,
    );

    await user.click(screen.getByRole('button', { name: /new project/i }));
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
      <AppSidebar isOpen {...sidebarProps} onCreateProject={onCreateProject} />,
    );

    await user.click(screen.getByRole('button', { name: /new project/i }));
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
      <AppSidebar
        isOpen
        {...sidebarProps}
        onCreateProject={onCreateProject}
        projects={[
          { id: 'p1', name: 'Alpha', description: null, threadCount: 0 },
        ]}
      />,
    );

    await user.click(screen.getByRole('button', { name: /new project/i }));
    const dialog = await screen.findByRole('dialog', { name: /new project/i });
    const nameInput = dialog.querySelector('#project-name');
    await user.type(nameInput as HTMLElement, 'Alpha');
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    const warning = await screen.findByRole('alert');
    expect(warning).toHaveTextContent(/already exists/i);
    expect(warning.className).toMatch(/pf-m-error/);
    expect(onCreateProject).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: /new project/i })).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});

async function openProjectMenu(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /actions for project alpha/i }));
}

describe('AppSidebar — delete project', () => {
  const projects = [
    { id: 'p1', name: 'Alpha', description: null, threadCount: 2 },
  ];

  it('offers Unassign and delete and keeps the project until confirmed', async () => {
    const user = userEvent.setup();
    const onDeleteProject = vi.fn().mockResolvedValue(true);

    renderWithProviders(
      <AppSidebar isOpen {...sidebarProps} projects={projects} onDeleteProject={onDeleteProject} />,
    );

    await openProjectMenu(user);
    await user.click(screen.getByRole('menuitem', { name: /delete project/i }));
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
      <AppSidebar isOpen {...sidebarProps} projects={projects} onDeleteProject={onDeleteProject} />,
    );

    await openProjectMenu(user);
    await user.click(screen.getByRole('menuitem', { name: /delete project/i }));
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
      <AppSidebar isOpen {...sidebarProps} projects={projects} onDeleteProject={onDeleteProject} />,
    );

    await openProjectMenu(user);
    await user.click(screen.getByRole('menuitem', { name: /delete project/i }));
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
      <AppSidebar
        isOpen
        {...sidebarProps}
        projects={projects}
        onUnassignAll={onUnassignAll}
      />,
    );

    await openProjectMenu(user);
    await user.click(screen.getByRole('menuitem', { name: /unassign all chats/i }));
    expect(onUnassignAll).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: /^unassign$/i }));
    await waitFor(() => {
      expect(onUnassignAll).toHaveBeenCalledWith('p1');
    });
  });

  it('hides the unassign-all action when the project has no chats', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <AppSidebar
        isOpen
        {...sidebarProps}
        projects={[{ id: 'p1', name: 'Alpha', description: null, threadCount: 0 }]}
        onUnassignAll={vi.fn()}
      />,
    );

    await openProjectMenu(user);
    expect(
      screen.queryByRole('menuitem', { name: /unassign all chats/i }),
    ).not.toBeInTheDocument();
  });
});

const sampleChat = {
  id: 'c1',
  title: 'Research thread',
  timestamp: new Date('2026-01-01'),
  preview: 'hello',
};

describe('AppSidebar — add chat to project', () => {
  it('assigns an unassigned chat from the add-to-project menu', async () => {
    const user = userEvent.setup();
    const onAssignThread = vi.fn().mockResolvedValue(true);

    renderWithProviders(
      <AppSidebar
        isOpen
        {...sidebarProps}
        chatHistory={[sampleChat]}
        projects={[{ id: 'p1', name: 'Alpha', description: null, threadCount: 0 }]}
        onAssignThread={onAssignThread}
      />,
    );

    await user.click(screen.getByRole('button', { name: /actions for chat: research thread/i }));
    await user.click(await screen.findByRole('menuitem', { name: 'Alpha' }));

    await waitFor(() => {
      expect(onAssignThread).toHaveBeenCalledWith('c1', 'p1');
    });
  });

  it('lists a chat whose project no longer exists under Chats', async () => {
    renderWithProviders(
      <AppSidebar
        isOpen
        {...sidebarProps}
        chatHistory={[{ ...sampleChat, project_id: 'deleted-project' }]}
        projects={[{ id: 'p1', name: 'Alpha', description: null, threadCount: 0 }]}
        onAssignThread={vi.fn()}
      />,
    );

    expect(screen.getByText('Research thread')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: /alpha chats/i })).not.toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /actions for chat: research thread/i }));
    expect(await screen.findByRole('menuitem', { name: 'Alpha' })).toBeInTheDocument();
    expect(
      screen.queryByRole('menuitem', { name: /remove from project/i }),
    ).not.toBeInTheDocument();
  });

  it('gives the project chat list a fixed height that can scroll', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <AppSidebar
        isOpen
        {...sidebarProps}
        chatHistory={[{ ...sampleChat, project_id: 'p1' }]}
        projects={[{ id: 'p1', name: 'Alpha', description: null, threadCount: 1 }]}
      />,
    );

    await user.click(screen.getByRole('button', { name: /expand alpha/i }));

    const list = screen.getByRole('list', { name: /alpha chats/i });
    // The fixed height and scrolling live in sidebar.css (.app-project-chats).
    expect(list).toHaveClass('app-project-chats');
  });

  it('unassigns a project chat instead of offering add-to-project', async () => {
    const user = userEvent.setup();
    const onAssignThread = vi.fn().mockResolvedValue(true);

    renderWithProviders(
      <AppSidebar
        isOpen
        {...sidebarProps}
        chatHistory={[{ ...sampleChat, project_id: 'p1' }]}
        projects={[{ id: 'p1', name: 'Alpha', description: null, threadCount: 1 }]}
        onAssignThread={onAssignThread}
      />,
    );

    await user.click(screen.getByRole('button', { name: /expand alpha/i }));

    await user.click(screen.getByRole('button', { name: /actions for chat: research thread/i }));
    expect(screen.queryByRole('menuitem', { name: 'Alpha' })).not.toBeInTheDocument();
    await user.click(await screen.findByRole('menuitem', { name: /remove from project/i }));

    await waitFor(() => {
      expect(onAssignThread).toHaveBeenCalledWith('c1', null);
    });
  });
});

describe('AppSidebar — navigation', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
  });

  it('is a navigation landmark named Chats', () => {
    renderWithProviders(<AppSidebar isOpen {...sidebarProps} />);
    expect(screen.getByRole('navigation', { name: 'Chats' })).toBeInTheDocument();
  });

  it('marks the active thread link with aria-current=page', () => {
    renderWithProviders(
      <AppSidebar
        isOpen
        {...sidebarProps}
        currentChatId="c1"
        chatHistory={[sampleChat, { ...sampleChat, id: 'c2', title: 'Other' }]}
      />,
    );
    expect(screen.getByRole('link', { name: 'Research thread' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'Other' })).not.toHaveAttribute('aria-current');
  });

  it('selects a chat when its link is clicked', async () => {
    const user = userEvent.setup();
    const onSelectChat = vi.fn();
    renderWithProviders(
      <AppSidebar isOpen {...sidebarProps} onSelectChat={onSelectChat} chatHistory={[sampleChat]} />,
    );
    await user.click(screen.getByRole('link', { name: 'Research thread' }));
    expect(onSelectChat).toHaveBeenCalledWith('c1');
  });

  it('lets modified clicks fall through to the browser', () => {
    const onSelectChat = vi.fn();
    renderWithProviders(
      <AppSidebar isOpen {...sidebarProps} onSelectChat={onSelectChat} chatHistory={[sampleChat]} />,
    );
    const link = screen.getByRole('link', { name: 'Research thread' });
    const notPrevented = fireEvent.click(link, { ctrlKey: true });
    fireEvent.click(link, { metaKey: true });
    fireEvent.click(link, { button: 1 });
    expect(notPrevented).toBe(true);
    expect(onSelectChat).not.toHaveBeenCalled();
    const plain = fireEvent.click(link);
    expect(plain).toBe(false);
    expect(onSelectChat).toHaveBeenCalledWith('c1');
  });

  it('keeps the row kebab marked visible while its menu is open', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AppSidebar isOpen {...sidebarProps} chatHistory={[sampleChat]} />);
    const kebab = screen.getByRole('button', { name: /Actions for chat/ });
    expect(kebab).not.toHaveClass('app-nav-row__toggle--open');
    await user.click(kebab);
    expect(kebab).toHaveClass('app-nav-row__toggle--open');
  });

  it('keeps the full title as the accessible name and has no native title tooltip', () => {
    const long = 'x'.repeat(200);
    renderWithProviders(
      <AppSidebar isOpen {...sidebarProps} chatHistory={[{ ...sampleChat, title: long }]} />,
    );
    const link = screen.getByRole('link', { name: long });
    expect(link).not.toHaveAttribute('title');
    expect(link).toHaveAttribute('href');
  });

  it('shows an empty state when there are no chats', () => {
    renderWithProviders(<AppSidebar isOpen {...sidebarProps} />);
    expect(screen.getByText('No chats yet')).toBeInTheDocument();
  });

  it('starts a new chat from the New Chat button', async () => {
    const user = userEvent.setup();
    const onNewChat = vi.fn();
    renderWithProviders(<AppSidebar isOpen {...sidebarProps} onNewChat={onNewChat} />);
    const button = screen.getByRole('button', { name: 'New Chat' });
    expect(button.className).toMatch(/pf-m-primary/);
    await user.click(button);
    expect(onNewChat).toHaveBeenCalledWith();
  });

  it('renames a chat through the actions menu', async () => {
    const user = userEvent.setup();
    const onRenameChat = vi.fn();
    renderWithProviders(
      <AppSidebar isOpen {...sidebarProps} onRenameChat={onRenameChat} chatHistory={[sampleChat]} />,
    );
    await user.click(screen.getByRole('button', { name: /actions for chat: research thread/i }));
    await user.click(await screen.findByRole('menuitem', { name: /rename/i }));
    const input = screen.getByRole('textbox', { name: /rename chat/i });
    await user.clear(input);
    await user.type(input, 'Renamed{Enter}');
    expect(onRenameChat).toHaveBeenCalledWith('c1', 'Renamed');
  });

  it('deletes a chat after confirmation', async () => {
    const user = userEvent.setup();
    const onDeleteChat = vi.fn();
    renderWithProviders(
      <AppSidebar isOpen {...sidebarProps} onDeleteChat={onDeleteChat} chatHistory={[sampleChat]} />,
    );
    await user.click(screen.getByRole('button', { name: /actions for chat: research thread/i }));
    await user.click(await screen.findByRole('menuitem', { name: /delete/i }));
    expect(onDeleteChat).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: /^delete$/i }));
    expect(onDeleteChat).toHaveBeenCalledWith('c1');
  });
});
