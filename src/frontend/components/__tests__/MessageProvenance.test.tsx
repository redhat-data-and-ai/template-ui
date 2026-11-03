import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MessageProvenance } from '../MessageProvenance';

/**
 * The line exists to let a reader weigh one answer differently from
 * another. So the tests are about what it says, and — just as much —
 * about when it stays quiet.
 */
describe('MessageProvenance', () => {
  it('renders nothing when there is nothing to say', () => {
    const { container } = render(<MessageProvenance provenance={{}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when absent', () => {
    const { container } = render(<MessageProvenance provenance={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the model that answered', () => {
    render(<MessageProvenance provenance={{ model: 'gemini-3.8-flash' }} />);
    expect(screen.getByText('gemini-3.8-flash')).toBeInTheDocument();
  });

  it('stays quiet about an ordinary stop', () => {
    // A badge per turn announcing that everything is normal is noise
    // that teaches people to stop reading the line.
    render(
      <MessageProvenance
        provenance={{ model: 'gemini-3.8-flash', finish_reason: 'STOP' }}
      />,
    );
    expect(screen.queryByText(/cut off/i)).not.toBeInTheDocument();
  });

  it('warns when the answer was cut off', () => {
    render(<MessageProvenance provenance={{ model: 'm', truncated: true }} />);
    expect(screen.getByText(/cut off/i)).toBeInTheDocument();
  });

  it('warns when the model returned nothing', () => {
    render(<MessageProvenance provenance={{ empty: true }} />);
    expect(screen.getByText(/returned nothing/i)).toBeInTheDocument();
  });

  it('names the model a fallback replaced', () => {
    render(<MessageProvenance provenance={{ fallback_from: 'gemini-3.8-flash' }} />);
    expect(screen.getByText(/gemini-3\.8-flash failed/i)).toBeInTheDocument();
  });

  it('reports the tier routing chose, and how', () => {
    render(<MessageProvenance provenance={{ routed_tier: 'fast', routed_by: 'rule' }} />);
    expect(screen.getByText(/routed to fast by rule/i)).toBeInTheDocument();
  });

  it('reports a tier without a method', () => {
    render(<MessageProvenance provenance={{ routed_tier: 'deep' }} />);
    expect(screen.getByText(/routed to deep/i)).toBeInTheDocument();
  });

  it('reports a cached reply', () => {
    render(<MessageProvenance provenance={{ cached: true }} />);
    expect(screen.getByText(/from cache/i)).toBeInTheDocument();
  });
});
