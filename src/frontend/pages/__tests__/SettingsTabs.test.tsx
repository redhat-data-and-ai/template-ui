import React from 'react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import { SettingsPage } from '../SettingsPage';
import chatsReducer from '../../redux/slices/chats';
import configReducer from '../../redux/slices/config';
import personalizationReducer from '../../redux/slices/personalization';
import toastsReducer from '../../redux/slices/toasts';
import userSettingsReducer from '../../redux/slices/userSettings';
import projectsReducer from '../../redux/slices/projects';

/**
 * Which tabs a reader is offered.
 *
 * Usage reads `/analytics/*`, which the agent gates on a privileged
 * LDAP role. The tab is gated on that role **and** developer mode, so
 * operational figures stay off the everyday surface. The hiding is
 * not the control — the server is — but a regression here puts an
 * admin view in front of everyone.
 */

function renderTabs({
  role,
  developerMode,
  features,
}: {
  role?: string;
  developerMode: boolean;
  features?: Record<string, unknown>;
}) {
  (window as unknown as { APP_DATA?: Record<string, unknown> }).APP_DATA = {
    ...(window as unknown as { APP_DATA?: Record<string, unknown> }).APP_DATA,
    userRole: role,
  };

  const store = configureStore({
    reducer: {
      chats: chatsReducer,
      config: configReducer,
      personalization: personalizationReducer,
      toasts: toastsReducer,
      userSettings: userSettingsReducer,
      projects: projectsReducer,
    },
    preloadedState: {
      ...(features
        ? { config: { branding: null, features, content: null } as never }
        : {}),
      userSettings: {
        theme: 'dark' as const,
        debugMode: false,
        developerMode,
        alwaysAllowedTools: [],
        autoApproveAllTools: false,
        _userOverrides: {},
      },
    },
  });

  return render(
    <Provider store={store}>
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    </Provider>,
  );
}

async function tabNames(): Promise<string[]> {
  const tabs = await screen.findAllByRole('tab');
  return tabs.map((t) => t.textContent?.trim() ?? '');
}

const original = (window as unknown as { APP_DATA?: unknown }).APP_DATA;
afterEach(() => {
  (window as unknown as { APP_DATA?: unknown }).APP_DATA = original;
});
beforeEach(() => {
  (window as unknown as { APP_DATA?: Record<string, unknown> }).APP_DATA = {};
});

describe('Settings tabs', () => {
  it('hides Usage from an ordinary user', async () => {
    renderTabs({ role: 'users', developerMode: true });
    expect(await tabNames()).not.toContain('Developers');
  });

  it('hides Usage when the role is unknown', async () => {
    // The safe default for a privileged surface is hidden, including
    // when the role could not be read at all.
    renderTabs({ role: undefined, developerMode: true });
    expect(await tabNames()).not.toContain('Developers');
  });

  it('hides Usage from a privileged user with developer mode off', async () => {
    // The role alone is not enough — this is the case that regressed.
    renderTabs({ role: 'owners', developerMode: false });
    expect(await tabNames()).not.toContain('Developers');
  });

  it('shows Usage to a privileged user with developer mode on', async () => {
    renderTabs({ role: 'owners', developerMode: true });
    expect(await tabNames()).toContain('Developers');
  });

  it('keeps the everyday tabs for everyone', async () => {
    renderTabs({ role: 'users', developerMode: false });
    const names = await tabNames();
    for (const tab of [
      'Account',
      'Appearance',
      'Personalisation',
      // MCP, Skills, Subagents and Prompt are sections inside
      // Components now, not entries in the outer bar.
      'Components',
    ]) {
      expect(names).toContain(tab);
    }
  });
});

describe('Settings tabs — Datasets', () => {
  it('is no longer an outer tab', async () => {
    // It moved into Components. Its own gate did not change: a
    // shared volume with no per-user partitioning stays an operator
    // capability, not a deployment preference.
    renderTabs({ role: 'owners', developerMode: true });
    expect(await tabNames()).not.toContain('Datasets');
    expect(await tabNames()).toContain('Components');
  });

  it('keeps Components visible for an ordinary user via its other sections', async () => {
    renderTabs({ role: 'users', developerMode: false });
    expect(await tabNames()).toContain('Components');
  });

  it('keeps Components for an operator when only Datasets survives', async () => {
    renderTabs({
      role: 'owners',
      developerMode: true,
      features: {
        skills_visible_to_all: false,
        subagents_visible_to_all: false,
        prompt_visible_to_all: false,
        models_visible_to_all: false,
      },
    });
    expect(await tabNames()).toContain('Components');
  });
});

describe('Settings tabs — Components visibility', () => {
  it('shows Components to everyone by default', async () => {
    renderTabs({ role: 'users', developerMode: false });
    expect(await tabNames()).toContain('Components');
  });

  it('keeps the group while any section is visible', async () => {
    // Hiding one member must not take the other three with it.
    renderTabs({
      role: 'users',
      developerMode: false,
      features: { skills_visible_to_all: false, prompt_visible_to_all: false },
    });
    expect(await tabNames()).toContain('Components');
  });

  it('keeps the group even with every flag off, because MCP cannot be hidden', async () => {
    // MCP is how a person connects their integrations. Hiding it
    // would not simplify the page, it would remove the ability to
    // use the product — so it has no flag and the group always has
    // at least one section.
    renderTabs({
      role: 'users',
      developerMode: false,
      features: {
        skills_visible_to_all: false,
        subagents_visible_to_all: false,
        prompt_visible_to_all: false,
        models_visible_to_all: false,
      },
    });
    expect(await tabNames()).toContain('Components');
  });

  it('still shows the group when no flags are set', async () => {
    // An older config without the keys must not lose the tab.
    renderTabs({ role: 'users', developerMode: false, features: {} });
    expect(await tabNames()).toContain('Components');
  });
});

describe('Components sections', () => {
  it('calls the documents section Documents, not Datasets', async () => {
    const userEvent = (await import('@testing-library/user-event')).default;
    renderTabs({ role: 'owners', developerMode: true });

    await userEvent.click(await screen.findByRole('tab', { name: 'Components' }));
    const inner = await screen.findAllByRole('tab');
    const labels = inner.map((t) => t.textContent?.trim() ?? '');
    expect(labels).toContain('Documents');
    expect(labels).not.toContain('Datasets');
  });
  it('gates Models exactly as it gates Skills', async () => {
    // Same mechanism, so the assertion is that they move together:
    // one flag each, hidden from everyone when off, shown to
    // everyone when absent. A section that drifts to a different
    // rule is one an operator cannot reason about from the switch.
    const userEvent = (await import('@testing-library/user-event')).default;

    const labelsWith = async (features: Record<string, boolean>) => {
      cleanup();
      renderTabs({ role: 'users', developerMode: false, features });
      await userEvent.click(await screen.findByRole('tab', { name: 'Components' }));
      return (await screen.findAllByRole('tab')).map((t) => t.textContent?.trim() ?? '');
    };

    const shown = await labelsWith({});
    expect(shown).toContain('Skills');
    expect(shown).toContain('Models');

    const skillsOff = await labelsWith({ skills_visible_to_all: false });
    expect(skillsOff).not.toContain('Skills');
    expect(skillsOff).toContain('Models');

    const modelsOff = await labelsWith({ models_visible_to_all: false });
    expect(modelsOff).toContain('Skills');
    expect(modelsOff).not.toContain('Models');
  });
  it('keeps the flagged sections visible to a developer when the flags are off', async () => {
    // The flag answers "should everyone see this". A developer
    // turning it off is deciding what the product shows, not giving
    // up their own view of how the agent is configured — so they
    // keep it and ordinary users lose it.
    const userEvent = (await import('@testing-library/user-event')).default;
    const off = {
      skills_visible_to_all: false,
      subagents_visible_to_all: false,
      prompt_visible_to_all: false,
      models_visible_to_all: false,
    };

    cleanup();
    renderTabs({ role: 'owners', developerMode: true, features: off });
    await userEvent.click(await screen.findByRole('tab', { name: 'Components' }));
    const asDeveloper = (await screen.findAllByRole('tab')).map(
      (t) => t.textContent?.trim() ?? '',
    );
    for (const label of ['Skills', 'Subagents', 'Prompt', 'Models']) {
      expect(asDeveloper).toContain(label);
    }

    cleanup();
    renderTabs({ role: 'users', developerMode: false, features: off });
    await userEvent.click(await screen.findByRole('tab', { name: 'Components' }));
    const asUser = (await screen.findAllByRole('tab')).map(
      (t) => t.textContent?.trim() ?? '',
    );
    for (const label of ['Skills', 'Subagents', 'Prompt', 'Models']) {
      expect(asUser).not.toContain(label);
    }
    // MCP has no flag, so the group never empties.
    expect(asUser).toContain('MCP');
  });

  it('needs developer mode on, not just the role', async () => {
    // Matches how Usage and Documents gate: the role alone is not
    // the switch, because an operator browsing normally should see
    // what everyone else sees.
    const userEvent = (await import('@testing-library/user-event')).default;
    cleanup();
    renderTabs({
      role: 'owners',
      developerMode: false,
      features: { skills_visible_to_all: false },
    });
    await userEvent.click(await screen.findByRole('tab', { name: 'Components' }));
    const labels = (await screen.findAllByRole('tab')).map(
      (t) => t.textContent?.trim() ?? '',
    );
    expect(labels).not.toContain('Skills');
  });
});
