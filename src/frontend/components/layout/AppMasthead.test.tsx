import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createTestStore } from '../../test-utils/createTestStore';
import { setBranding } from '../../redux/slices/config';
import { setTheme } from '../../redux/slices/userSettings';
import { AppMasthead } from './AppMasthead';
import type { BrandingConfig } from '../../services/config.service';

const baseBranding: BrandingConfig = {
  logo_url: '/logo.svg',
  title: 'My Agent',
  version: 'v1',
  colors: {
    light: { primary: '#0066cc', accent: '#a60000', background: '#ffffff', foreground: '#1a1a1a' },
    dark: { primary: '#4dabf7', accent: '#f56e6e', background: '#0a1628', foreground: '#f0f4f8' },
  },
};

const logoutMock = vi.hoisted(() => vi.fn());
vi.mock('../../services/logout', () => ({ logout: logoutMock }));

function setup(branding: Partial<BrandingConfig> = {}, onToggleSidebar = vi.fn(), theme: 'light' | 'dark' = 'light') {
  const store = createTestStore();
  store.dispatch(setBranding({ ...baseBranding, ...branding }));
  store.dispatch(setTheme(theme));
  render(
    <Provider store={store}>
      <MemoryRouter>
        <AppMasthead isSidebarOpen onToggleSidebar={onToggleSidebar} />
      </MemoryRouter>
    </Provider>,
  );
  return { store, onToggleSidebar };
}

beforeEach(() => {
  logoutMock.mockReset();
});

describe('AppMasthead', () => {
  it('has no debug toggle (it lives in the chat header)', () => {
    setup();
    expect(screen.queryByRole('button', { name: /debug mode/i })).toBeNull();
  });

  it('renders the logo and the agent title', () => {
    setup();
    expect(screen.getByRole('img', { name: 'My Agent' })).toBeInTheDocument();
    expect(screen.getByText('My Agent')).toBeInTheDocument();
  });

  it('renders platform name link, emphasis, separator and title', () => {
    setup({ platform_name: 'Acme', platform_name_emphasis: 'Agent Hub', platform_url: 'https://hub.example.com' });
    const link = screen.getByRole('link', { name: 'Acme Agent Hub' });
    expect(link).toHaveAttribute('href', 'https://hub.example.com');
    expect(link.querySelector('b')?.textContent).toBe('Agent Hub');
    expect(screen.getByTestId('masthead-separator')).toBeInTheDocument();
    expect(screen.getByText('My Agent')).toBeInTheDocument();
  });

  it('renders plain text for a non-http platform url', () => {
    setup({ platform_name: 'Acme', platform_url: 'javascript:alert(1)' });
    expect(screen.queryByRole('link', { name: /Acme/ })).toBeNull();
    expect(screen.getByText('Acme')).toBeInTheDocument();
  });

  it('links a same-origin relative platform url', () => {
    setup({ platform_name: 'Acme', platform_url: '/' });
    expect(screen.getByRole('link', { name: 'Acme' })).toHaveAttribute('href', '/');
  });

  it('renders plain text for a protocol-relative platform url', () => {
    setup({ platform_name: 'Acme', platform_url: '//evil.com' });
    expect(screen.queryByRole('link', { name: /Acme/ })).toBeNull();
    expect(screen.getByText('Acme')).toBeInTheDocument();
  });

  it('renders only the emphasis part when platform_name is absent', () => {
    setup({ platform_name_emphasis: 'Hub' });
    expect(screen.getByText('Hub').tagName).toBe('B');
    expect(screen.getByTestId('masthead-separator')).toBeInTheDocument();
  });

  it('has no separator without platform keys', () => {
    setup();
    expect(screen.queryByTestId('masthead-separator')).toBeNull();
  });

  it('exposes the full long title in a title attribute', () => {
    const long = 'A'.repeat(120);
    setup({ title: long });
    expect(screen.getByText(long)).toHaveAttribute('title', long);
  });

  it('toggles theme from the masthead', async () => {
    setup({}, vi.fn(), 'dark');
    await userEvent.click(screen.getByRole('button', { name: 'Switch to light mode' }));
    expect(screen.getByRole('button', { name: 'Switch to dark mode' })).toBeInTheDocument();
  });

  it('calls onToggleSidebar from the nav toggle', async () => {
    const { onToggleSidebar } = setup();
    await userEvent.click(screen.getByRole('button', { name: /toggle navigation|global navigation/i }));
    expect(onToggleSidebar).toHaveBeenCalled();
  });

  it('user menu offers Settings and Log out', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: /menu$/i }));
    expect(screen.getByRole('menuitem', { name: 'Settings' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('menuitem', { name: 'Log out' }));
    expect(logoutMock).toHaveBeenCalled();
  });
});
