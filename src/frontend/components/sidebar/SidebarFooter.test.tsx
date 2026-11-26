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
    ['healthy', 'Agent: Healthy', 'green'],
    ['unhealthy', 'Agent: Unhealthy', 'red'],
    ['unknown', 'Agent: Unknown', 'grey'],
  ])('renders %s as a filled %s label', (status, text, color) => {
    healthMock.mockReturnValue({ status });
    render(<SidebarFooter />);
    const label = screen.getByText(text).closest('.pf-v6-c-label');
    // PatternFly's default (grey) label carries no colour modifier class.
    if (color === 'grey') expect(label?.className).not.toMatch(/pf-m-(green|red)/);
    else expect(label).toHaveClass(`pf-m-${color}`);
    expect(label).toHaveClass('pf-m-compact');
    expect(label).not.toHaveClass('pf-m-outline');
  });
});
