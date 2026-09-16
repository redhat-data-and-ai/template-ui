import { describe, it, expect } from 'vitest';
import toastsReducer, { addToast, removeToast, clearAllToasts, selectToasts } from './toasts';

function initialState() {
  return toastsReducer(undefined, { type: '@@INIT' });
}

describe('toasts slice', () => {
  it('starts with empty toasts', () => {
    expect(initialState().toasts).toEqual([]);
  });

  it('addToast adds a toast with an auto-generated id', () => {
    const state = toastsReducer(
      initialState(),
      addToast({ title: 'Hello', variant: 'success' }),
    );
    expect(state.toasts).toHaveLength(1);
    expect(state.toasts[0].title).toBe('Hello');
    expect(state.toasts[0].variant).toBe('success');
    expect(state.toasts[0].id).toMatch(/^toast-\d+$/);
  });

  it('addToast includes optional message', () => {
    const state = toastsReducer(
      initialState(),
      addToast({ title: 'Error', message: 'Details', variant: 'danger' }),
    );
    expect(state.toasts[0].message).toBe('Details');
  });

  it('removeToast removes a toast by id', () => {
    let state = toastsReducer(initialState(), addToast({ title: 'A', variant: 'info' }));
    const id = state.toasts[0].id;
    state = toastsReducer(state, removeToast(id));
    expect(state.toasts).toHaveLength(0);
  });

  it('removeToast does nothing for unknown id', () => {
    let state = toastsReducer(initialState(), addToast({ title: 'A', variant: 'info' }));
    state = toastsReducer(state, removeToast('nonexistent'));
    expect(state.toasts).toHaveLength(1);
  });

  it('clearAllToasts removes all toasts', () => {
    let state = toastsReducer(initialState(), addToast({ title: 'A', variant: 'info' }));
    state = toastsReducer(state, addToast({ title: 'B', variant: 'warning' }));
    state = toastsReducer(state, clearAllToasts());
    expect(state.toasts).toEqual([]);
  });

  it('selectToasts returns the toast array', () => {
    const rootState = { toasts: { toasts: [{ id: '1', title: 'x', variant: 'info' as const }] } };
    expect(selectToasts(rootState)).toEqual([{ id: '1', title: 'x', variant: 'info' }]);
  });
});
