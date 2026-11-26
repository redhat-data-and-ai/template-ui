import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SidebarFooter } from './SidebarFooter';

const healthMock = vi.fn();
vi.mock('../../hooks/useAgentHealth', () => ({
  useAgentHealth: () => healthMock(),
}));

beforeEach(() => healthMock.mockReset());

describe('SidebarFooter', () => {
  it.each([
    ['healthy', 'Agent: healthy'],
    ['unhealthy', 'Agent: unhealthy'],
    ['unknown', 'Agent: unknown'],
  ])('renders %s as a quiet dot + text line', (status, text) => {
    healthMock.mockReturnValue({ status });
    const { container } = render(<SidebarFooter />);
    const root = container.querySelector('.app-sidebar-footer');
    expect(root).toHaveAttribute('data-health', status);
    expect(screen.getByText(text)).toBeInTheDocument();
    expect(container.querySelector('.pf-v6-c-label')).toBeNull();
    expect(container.querySelector('.app-sidebar-footer__dot')).toHaveAttribute(
      'aria-hidden',
      'true',
    );
  });
});
