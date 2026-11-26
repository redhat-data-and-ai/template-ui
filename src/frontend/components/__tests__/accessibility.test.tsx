/**
 * Accessibility test suite — WCAG 2.1 AA compliance
 *
 * Tests cover:
 * - axe-core automated scans for each page/component
 * - ARIA landmark, role, label, and keyboard navigation attributes
 * - Live region presence for dynamic content
 * - Semantic HTML and form labelling
 */
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, beforeEach, afterEach } from 'vitest';
import { axe } from '../../test-utils/setup';
import { renderWithProviders } from '../../test-utils/render';
import { HomePage } from '../../pages/HomePage';
import { SettingsPage } from '../../pages/SettingsPage';
import { AppearanceSettings } from '../settings/AppearanceSettings';
import { InputForm } from '../InputForm';
import { RedHatLogo } from '../RedHatLogo';
import { MemoryList } from '../settings/MemoryList';
import { RulesEditor } from '../settings/RulesEditor';
import { SubAgentIndicator } from '../SubAgentIndicator';
import { ToolApprovalControls } from '../ToolApprovalControls';
import { AppSidebar } from '../sidebar/AppSidebar';

// Mock fetch for components that call personalization API on mount.
// Keep posted rules in memory so add → refetch does not wipe the list.
let mockRules: {
  id: string;
  content: string;
  is_active: boolean;
  created_at: string;
}[] = [];

beforeEach(() => {
  mockRules = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/personalization/memories')) {
        return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
      }
      if (url.includes('/personalization/rules')) {
        if (init?.method === 'POST') {
          const body = JSON.parse(String(init.body ?? '{}')) as {
            id?: string;
            content?: string;
            is_active?: boolean;
          };
          const rule = {
            id: body.id ?? 'rule-1',
            content: body.content ?? '',
            is_active: body.is_active !== false,
            created_at: new Date().toISOString(),
          };
          const idx = mockRules.findIndex((r) => r.id === rule.id);
          if (idx >= 0) mockRules[idx] = rule;
          else mockRules.unshift(rule);
          return Promise.resolve(new Response(JSON.stringify(rule), { status: 201 }));
        }
        if (init?.method === 'DELETE') {
          const id = url.split('/').pop();
          if (id && id !== 'rules') {
            mockRules = mockRules.filter((r) => r.id !== id);
          } else {
            mockRules = [];
          }
          return Promise.resolve(new Response(null, { status: 204 }));
        }
        return Promise.resolve(
          new Response(JSON.stringify({ rules: mockRules }), { status: 200 }),
        );
      }
      return Promise.resolve(new Response('{}', { status: 200 }));
    }),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// HomePage
// ---------------------------------------------------------------------------
describe('HomePage — accessibility', () => {
  it('passes axe audit', async () => {
    const { container } = renderWithProviders(<HomePage />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('has an accessible label on the chat textarea', () => {
    renderWithProviders(<HomePage />);
    const textarea = screen.getByRole('textbox', { name: /enter a prompt/i });
    expect(textarea).toBeInTheDocument();
  });

  it('has an accessible send button', () => {
    renderWithProviders(<HomePage />);
    const btn = screen.getByRole('button', { name: /send message/i });
    expect(btn).toBeInTheDocument();
  });

  it('quick-prompt buttons have descriptive aria-labels', () => {
    renderWithProviders(<HomePage />);
    const promptBtns = screen.getAllByRole('button', { name: /start chat:/i });
    expect(promptBtns.length).toBeGreaterThan(0);
  });

  it('emojis in headings are hidden from screen readers', () => {
    renderWithProviders(<HomePage />);
    const hiddenEmojis = document.querySelectorAll('[aria-hidden="true"]');
    const emojiElements = Array.from(hiddenEmojis).filter(
      (el) => el.textContent === '👋' || el.textContent === '🚀',
    );
    expect(emojiElements.length).toBeGreaterThan(0);
  });

  it('greeting is the single level-1 heading', () => {
    renderWithProviders(<HomePage />);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('quick-prompt list has an accessible group label', () => {
    renderWithProviders(<HomePage />);
    const list = screen.getByRole('list', { name: /quick prompt suggestions/i });
    expect(list).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// SettingsPage — navigation
// ---------------------------------------------------------------------------
describe('SettingsPage — accessibility', () => {
  it('passes axe audit', async () => {
    const { container } = renderWithProviders(<SettingsPage />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('section list is a labelled nav landmark of links', () => {
    renderWithProviders(<SettingsPage />);
    const nav = screen.getByRole('navigation', { name: 'Settings sections' });
    expect(within(nav).getAllByRole('link').length).toBeGreaterThan(0);
  });

  it('exactly one section is marked current', () => {
    renderWithProviders(<SettingsPage />);
    const nav = screen.getByRole('navigation', { name: 'Settings sections' });
    const current = within(nav)
      .getAllByRole('link')
      .filter((l) => l.getAttribute('aria-current') === 'page');
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveTextContent('Profile');
  });

  it('the content panel is labelled by the active section', () => {
    renderWithProviders(<SettingsPage />);
    expect(screen.getByRole('heading', { name: 'Profile', level: 2 })).toBeInTheDocument();
  });

  it('back button has a descriptive aria-label', () => {
    renderWithProviders(<SettingsPage />);
    const back = screen.getByRole('button', { name: /back to home/i });
    expect(back).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// AppearanceSettings — radiogroup
// ---------------------------------------------------------------------------
describe('AppearanceSettings — accessibility', () => {
  it('passes axe audit', async () => {
    const { container } = renderWithProviders(<AppearanceSettings />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('has a radiogroup wrapping theme options', () => {
    renderWithProviders(<AppearanceSettings />);
    const group = screen.getByRole('radiogroup');
    expect(group).toBeInTheDocument();
  });

  it('theme options have role="radio"', () => {
    renderWithProviders(<AppearanceSettings />);
    const radios = screen.getAllByRole('radio');
    expect(radios.length).toBe(2);
  });

  it('exactly one radio is checked by default', () => {
    renderWithProviders(<AppearanceSettings />);
    const checked = screen
      .getAllByRole('radio')
      .filter((r) => (r as HTMLInputElement).checked);
    expect(checked.length).toBe(1);
  });

  it('clicking a theme option marks it as checked', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AppearanceSettings />);
    const radios = screen.getAllByRole('radio');
    await user.click(radios[1]);
    expect(radios[1]).toBeChecked();
  });
});

// ---------------------------------------------------------------------------
// InputForm
// ---------------------------------------------------------------------------
describe('InputForm — accessibility', () => {
  const noop = () => {};

  it('passes axe audit', async () => {
    const { container } = render(
      <InputForm onSubmit={noop} onCancel={noop} isLoading={false} />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it('textarea has accessible label "Type a message"', () => {
    render(
      <InputForm onSubmit={noop} onCancel={noop} isLoading={false} />,
    );
    expect(screen.getByRole('textbox', { name: /type a message/i })).toBeInTheDocument();
  });

  it('send button has accessible label', () => {
    render(
      <InputForm onSubmit={noop} onCancel={noop} isLoading={false} />,
    );
    expect(screen.getByRole('button', { name: /send message/i })).toBeInTheDocument();
  });

  it('cancel button has accessible label during loading', () => {
    render(
      <InputForm onSubmit={noop} onCancel={noop} isLoading={true} />,
    );
    expect(screen.getByRole('button', { name: /cancel streaming/i })).toBeInTheDocument();
  });

});

// ---------------------------------------------------------------------------
// RedHatLogo
// ---------------------------------------------------------------------------
describe('RedHatLogo — accessibility', () => {
  it('is hidden from assistive technology (decorative)', () => {
    render(<RedHatLogo className="h-6 w-6" />);
    const svg = document.querySelector('svg');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveAttribute('focusable', 'false');
  });
});

// ---------------------------------------------------------------------------
// MemoryList
// ---------------------------------------------------------------------------
describe('MemoryList — accessibility', () => {
  it('passes axe audit (empty state)', async () => {
    const { container } = renderWithProviders(<MemoryList />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('shows informational text about agent-created memories', () => {
    renderWithProviders(<MemoryList />);
    expect(screen.getByText(/memories the agent has created/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// RulesEditor
// ---------------------------------------------------------------------------
describe('RulesEditor — accessibility', () => {
  it('passes axe audit (empty state)', async () => {
    const { container } = renderWithProviders(<RulesEditor />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('add-rule textarea has accessible label', () => {
    renderWithProviders(<RulesEditor />);
    expect(screen.getByRole('textbox', { name: /new rule/i })).toBeInTheDocument();
  });

  it('remove button includes rule content in accessible label', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RulesEditor />);
    const textarea = screen.getByRole('textbox', { name: /new rule/i });
    await user.type(textarea, 'Always respond in British English');
    await user.click(screen.getByRole('button', { name: /^add$/i }));
    const removeBtn = await screen.findByRole('button', {
      name: /remove rule: always respond in british english/i,
    });
    expect(removeBtn).toBeInTheDocument();
  });

  it('toggle switch label includes rule content', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RulesEditor />);
    const textarea = screen.getByRole('textbox', { name: /new rule/i });
    await user.type(textarea, 'Be concise');
    await user.click(screen.getByRole('button', { name: /^add$/i }));
    const toggle = await screen.findByRole('switch', { name: /toggle rule: be concise/i });
    expect(toggle).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// SubAgentIndicator — disclosure widget
// ---------------------------------------------------------------------------
describe('SubAgentIndicator — accessibility', () => {
  const baseToolCall = {
    id: 'tool-1',
    name: 'data_analyst',
    args: {},
    content: null,
  };

  it('passes axe audit (delegating state)', async () => {
    const { container } = render(
      <SubAgentIndicator
        toolCall={baseToolCall}
        messageId="msg-1"
        index={0}
      />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it('header has role="button" with aria-expanded=false by default', () => {
    render(
      <SubAgentIndicator
        toolCall={baseToolCall}
        messageId="msg-1"
        index={0}
      />,
    );
    const header = screen.getByRole('button', { name: /data.analyst/i });
    expect(header).toHaveAttribute('aria-expanded', 'false');
  });

  it('Enter key toggles expansion', async () => {
    const user = userEvent.setup();
    render(
      <SubAgentIndicator
        toolCall={baseToolCall}
        messageId="msg-1"
        index={0}
      />,
    );
    const header = screen.getByRole('button', { name: /data.analyst/i });
    header.focus();
    await user.keyboard('{Enter}');
    expect(header).toHaveAttribute('aria-expanded', 'true');
  });

  it('Space key toggles expansion', async () => {
    const user = userEvent.setup();
    render(
      <SubAgentIndicator
        toolCall={baseToolCall}
        messageId="msg-1"
        index={0}
      />,
    );
    const header = screen.getByRole('button', { name: /data.analyst/i });
    header.focus();
    await user.keyboard(' ');
    expect(header).toHaveAttribute('aria-expanded', 'true');
  });


});

describe('Inline tool approval — accessibility', () => {
  it('passes axe audit and exposes the original decision buttons', async () => {
    const { container } = render(
      <ToolApprovalControls approval={{
        key: 'approval', interruptId: 'approval', actionIndex: 0,
        request: { name: 'data_analyst', args: {} },
        disabled: false, decision: null, decide: vi.fn(), alwaysAllow: vi.fn(),
      }} />,
    );
    expect(screen.getByRole('alert', { name: 'Tool call data_analyst requires approval' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Approve/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Reject/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Always allow/ })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });
});

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------
describe('AppSidebar — accessibility', () => {
  const defaultProps = {
    chatHistory: [],
    onNewChat: () => {},
    onSelectChat: () => {},
    onDeleteChat: () => {},
    onRenameChat: () => {},
  };

  it('passes axe audit (empty state)', async () => {
    const { container } = renderWithProviders(<AppSidebar isOpen {...defaultProps} />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('chat list is a <ul> with accessible label', () => {
    renderWithProviders(
      <AppSidebar
        isOpen
        {...defaultProps}
        chatHistory={[{ id: '1', title: 'Test Chat', timestamp: new Date(), preview: '' }]}
      />,
    );
    const list = screen.getByRole('list', { name: /chat history/i });
    expect(list).toBeInTheDocument();
  });

  it('chat items use <li> not role="option" (no interactive controls nesting violation)', () => {
    renderWithProviders(
      <AppSidebar
        isOpen
        {...defaultProps}
        chatHistory={[{ id: '1', title: 'Test Chat', timestamp: new Date(), preview: '' }]}
      />,
    );
    expect(document.querySelector('[role="option"]')).toBeNull();
    expect(document.querySelector('[role="listbox"]')).toBeNull();
    expect(document.querySelector('li')).toBeInTheDocument();
  });

  it('search input has accessible label', () => {
    renderWithProviders(
      <AppSidebar
        isOpen
        {...defaultProps}
        chatHistory={[
          { id: '1', title: 'Thread One', timestamp: new Date(), preview: '' },
          { id: '2', title: 'Thread Two', timestamp: new Date(), preview: '' },
          { id: '3', title: 'Thread Three', timestamp: new Date(), preview: '' },
          { id: '4', title: 'Thread Four', timestamp: new Date(), preview: '' },
        ]}
      />,
    );
    expect(screen.getByRole('textbox', { name: /search chat threads/i })).toBeInTheDocument();
  });

  it('new chat button has accessible label', () => {
    renderWithProviders(<AppSidebar isOpen {...defaultProps} />);
    expect(screen.getByRole('button', { name: /new chat/i })).toBeInTheDocument();
  });
});
