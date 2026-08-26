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
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
import { Sidebar } from '../Sidebar';

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

  it('quick-prompt list has an accessible group label', () => {
    renderWithProviders(<HomePage />);
    const list = screen.getByRole('list', { name: /quick prompt suggestions/i });
    expect(list).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// SettingsPage — ARIA tab pattern
// ---------------------------------------------------------------------------
describe('SettingsPage — accessibility', () => {
  it('passes axe audit', async () => {
    const { container } = renderWithProviders(<SettingsPage />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('renders a tablist with correct role', () => {
    renderWithProviders(<SettingsPage />);
    const tablist = screen.getByRole('tablist');
    expect(tablist).toBeInTheDocument();
  });

  it('tablist is not wrapped in a redundant nav landmark', () => {
    renderWithProviders(<SettingsPage />);
    const tablist = screen.getByRole('tablist');
    expect(tablist.closest('nav')).toBeNull();
  });

  it('tabs have role="tab" and aria-selected', () => {
    renderWithProviders(<SettingsPage />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs.length).toBeGreaterThan(0);
    const selectedTabs = tabs.filter((t) => t.getAttribute('aria-selected') === 'true');
    expect(selectedTabs.length).toBe(1);
  });

  it('each tab has aria-controls pointing to its panel', () => {
    renderWithProviders(<SettingsPage />);
    const tabs = screen.getAllByRole('tab');
    tabs.forEach((tab) => {
      const controlsId = tab.getAttribute('aria-controls');
      expect(controlsId).toBeTruthy();
      expect(document.getElementById(controlsId!)).toBeInTheDocument();
    });
  });

  it('tabpanels have role="tabpanel" and aria-labelledby pointing to their tab', () => {
    renderWithProviders(<SettingsPage />);
    const panels = screen.getAllByRole('tabpanel');
    expect(panels.length).toBeGreaterThan(0);
    panels.forEach((panel) => {
      const labelledBy = panel.getAttribute('aria-labelledby');
      expect(labelledBy).toBeTruthy();
      expect(document.getElementById(labelledBy!)).toBeInTheDocument();
    });
  });

  it('inactive tab panels are hidden from assistive technology', () => {
    renderWithProviders(<SettingsPage />);
    const panels = document.querySelectorAll('[role="tabpanel"]');
    const hiddenPanels = document.querySelectorAll('[role="tabpanel"][hidden]');
    expect(panels.length).toBeGreaterThan(0);
    expect(hiddenPanels.length).toBe(panels.length - 1);
  });

  it('arrow-key navigation moves focus between tabs', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SettingsPage />);
    const tabs = screen.getAllByRole('tab');
    tabs[0].focus();
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(tabs[1]);
    await user.keyboard('{ArrowUp}');
    expect(document.activeElement).toBe(tabs[0]);
  });

  it('Home/End keys jump to first and last tabs', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SettingsPage />);
    const tabs = screen.getAllByRole('tab');
    tabs[0].focus();
    await user.keyboard('{End}');
    expect(document.activeElement).toBe(tabs[tabs.length - 1]);
    await user.keyboard('{Home}');
    expect(document.activeElement).toBe(tabs[0]);
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
      .filter((r) => r.getAttribute('aria-checked') === 'true');
    expect(checked.length).toBe(1);
  });

  it('clicking a theme option marks it as checked', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AppearanceSettings />);
    const radios = screen.getAllByRole('radio');
    await user.click(radios[1]);
    expect(radios[1]).toHaveAttribute('aria-checked', 'true');
  });
});

// ---------------------------------------------------------------------------
// InputForm
// ---------------------------------------------------------------------------
describe('InputForm — accessibility', () => {
  const noop = () => {};

  it('passes axe audit', async () => {
    const { container } = render(
      <InputForm onSubmit={noop} onCancel={noop} isLoading={false} hasHistory={false} />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it('textarea has accessible label "Type a message"', () => {
    render(
      <InputForm onSubmit={noop} onCancel={noop} isLoading={false} hasHistory={false} />,
    );
    expect(screen.getByRole('textbox', { name: /type a message/i })).toBeInTheDocument();
  });

  it('send button has accessible label', () => {
    render(
      <InputForm onSubmit={noop} onCancel={noop} isLoading={false} hasHistory={false} />,
    );
    expect(screen.getByRole('button', { name: /send message/i })).toBeInTheDocument();
  });

  it('cancel button has accessible label during loading', () => {
    render(
      <InputForm onSubmit={noop} onCancel={noop} isLoading={true} hasHistory={false} />,
    );
    expect(screen.getByRole('button', { name: /cancel streaming/i })).toBeInTheDocument();
  });

  it('New Chat button has accessible label when history exists', () => {
    render(
      <InputForm onSubmit={noop} onCancel={noop} isLoading={false} hasHistory={true} />,
    );
    expect(screen.getByRole('button', { name: /new chat/i })).toBeInTheDocument();
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

  it('add-memory textarea has accessible label', () => {
    renderWithProviders(<MemoryList />);
    expect(screen.getByRole('textbox', { name: /new memory/i })).toBeInTheDocument();
  });

  it('remove button includes memory content in accessible label', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MemoryList />);
    const textarea = screen.getByRole('textbox', { name: /new memory/i });
    await user.type(textarea, 'Prefer metric units');
    await user.click(screen.getByRole('button', { name: /^add$/i }));
    const removeBtn = screen.getByRole('button', { name: /remove memory: prefer metric units/i });
    expect(removeBtn).toBeInTheDocument();
  });

  it('remove button is keyboard-focusable (not just hover-visible)', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MemoryList />);
    const textarea = screen.getByRole('textbox', { name: /new memory/i });
    await user.type(textarea, 'Test memory entry');
    await user.click(screen.getByRole('button', { name: /^add$/i }));
    const removeBtn = screen.getByRole('button', { name: /remove memory/i });
    removeBtn.focus();
    expect(removeBtn).toHaveFocus();
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
    const removeBtn = screen.getByRole('button', { name: /remove rule: always respond in british english/i });
    expect(removeBtn).toBeInTheDocument();
  });

  it('toggle switch label includes rule content', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RulesEditor />);
    const textarea = screen.getByRole('textbox', { name: /new rule/i });
    await user.type(textarea, 'Be concise');
    await user.click(screen.getByRole('button', { name: /^add$/i }));
    const toggle = screen.getByRole('switch', { name: /toggle rule: be concise/i });
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

  it('approval alert uses role="alert" when approval is needed', () => {
    const interruptValue = {
      action_requests: [{ name: 'data_analyst' }],
    };
    render(
      <SubAgentIndicator
        toolCall={baseToolCall}
        messageId="msg-1"
        index={0}
        pendingInterrupt={{ value: interruptValue } as any}
        onInterruptResume={() => {}}
        onAlwaysAllow={() => {}}
      />,
    );
    const alert = document.querySelector('[role="alert"]');
    expect(alert).toBeInTheDocument();
  });

  it('approve/reject/always-allow buttons have descriptive aria-labels', () => {
    const interruptValue = {
      action_requests: [{ name: 'data_analyst' }],
    };
    render(
      <SubAgentIndicator
        toolCall={baseToolCall}
        messageId="msg-1"
        index={0}
        pendingInterrupt={{ value: interruptValue } as any}
        onInterruptResume={() => {}}
        onAlwaysAllow={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: /approve sub-agent action/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reject sub-agent action/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /always allow sub-agent/i })).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------
describe('Sidebar — accessibility', () => {
  const defaultProps = {
    chatHistory: [],
    onNewChat: () => {},
    onSelectChat: () => {},
    onDeleteChat: () => {},
    onRenameChat: () => {},
  };

  it('passes axe audit (empty state)', async () => {
    const { container } = renderWithProviders(<Sidebar {...defaultProps} />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('chat list is a <ul> with accessible label', () => {
    renderWithProviders(
      <Sidebar
        {...defaultProps}
        chatHistory={[{ id: '1', title: 'Test Chat', timestamp: new Date(), preview: '' }]}
      />,
    );
    const list = screen.getByRole('list', { name: /chat history/i });
    expect(list).toBeInTheDocument();
  });

  it('chat items use <li> not role="option" (no interactive controls nesting violation)', () => {
    renderWithProviders(
      <Sidebar
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
      <Sidebar
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
    renderWithProviders(<Sidebar {...defaultProps} />);
    expect(screen.getByRole('button', { name: /start new chat/i })).toBeInTheDocument();
  });

  it('settings button has accessible label', () => {
    renderWithProviders(<Sidebar {...defaultProps} />);
    expect(screen.getByRole('button', { name: /open settings/i })).toBeInTheDocument();
  });
});
