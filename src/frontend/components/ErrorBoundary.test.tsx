import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { ErrorBoundary } from './ErrorBoundary';

function ThrowingComponent() {
  throw new Error('Test error');
}

describe('ErrorBoundary', () => {
  it('renders children when no error', () => {
    const { getByText } = render(
      <ErrorBoundary>
        <span>Child content</span>
      </ErrorBoundary>,
    );
    expect(getByText('Child content')).toBeDefined();
  });

  it('renders error UI when child throws', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { getByText } = render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>,
    );
    expect(getByText('Something went wrong')).toBeDefined();
    vi.restoreAllMocks();
  });

  it('renders custom fallback when provided', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { getByText } = render(
      <ErrorBoundary fallback={<span>Custom fallback</span>}>
        <ThrowingComponent />
      </ErrorBoundary>,
    );
    expect(getByText('Custom fallback')).toBeDefined();
    vi.restoreAllMocks();
  });

  it('calls onError callback', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const onError = vi.fn();
    render(
      <ErrorBoundary onError={onError}>
        <ThrowingComponent />
      </ErrorBoundary>,
    );
    expect(onError).toHaveBeenCalledWith(expect.any(Error), expect.anything());
    vi.restoreAllMocks();
  });
});
