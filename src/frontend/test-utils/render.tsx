import React from 'react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import type { RenderOptions } from '@testing-library/react';
import { render } from '@testing-library/react';
import { createTestStore } from './createTestStore';

interface WrapperProps {
  children: React.ReactNode;
}

function renderWithProviders(
  ui: React.ReactElement,
  options?: Omit<RenderOptions, 'wrapper'> & { preloadedState?: Record<string, unknown> },
) {
  const { preloadedState, ...rest } = options ?? {};
  // Built once per call and closed over, rather than read from a
  // module variable that is cleared when `render` returns. A test
  // calling the returned `rerender` used to get a fresh default
  // store and silently lose everything it had seeded.
  const store = createTestStore(preloadedState);

  function AllProviders({ children }: WrapperProps) {
    return (
      <Provider store={store}>
        <MemoryRouter>{children}</MemoryRouter>
      </Provider>
    );
  }

  return render(ui, { wrapper: AllProviders, ...rest });
}

export { renderWithProviders };
