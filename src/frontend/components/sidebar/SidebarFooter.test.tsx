import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { SidebarFooter } from './SidebarFooter';

const healthMock = vi.fn();
vi.mock('../../hooks/useAgentHealth', () => ({
  useAgentHealth: () => healthMock(),
}));

beforeEach(() => healthMock.mockReset());

describe('SidebarFooter', () => {
  it.each([
    ['healthy', 'Healthy', 'pf-m-green'],
    ['unhealthy', 'Unhealthy', 'pf-m-red'],
    ['unknown', 'Unknown', ''],
  ])('renders %s as "Agent:" plus a compact filled label', (status, word, colorClass) => {
    healthMock.mockReturnValue({ status });
    const { container } = render(<SidebarFooter />);
    const root = container.querySelector('.app-sidebar-footer') as HTMLElement;
    expect(root).toHaveAttribute('data-health', status);
    expect(root).toHaveTextContent(`Agent: ${word}`);
    const label = container.querySelector('.pf-v6-c-label');
    expect(label).toHaveClass('pf-m-filled', 'pf-m-compact');
    if (colorClass) expect(label).toHaveClass(colorClass);
    else expect(label?.className).not.toMatch(/pf-m-(green|red|blue|orange|yellow|purple|teal)/);
    expect(label).not.toHaveClass('pf-m-outline');
    expect(label).toHaveTextContent(word);
    expect(container.querySelector('.app-sidebar-footer__dot')).toBeNull();
  });
});
