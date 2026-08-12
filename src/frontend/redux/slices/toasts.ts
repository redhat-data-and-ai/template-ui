import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export type ToastVariant = 'success' | 'danger' | 'warning' | 'info';

export interface Toast {
  id: string;
  title: string;
  message?: string;
  variant: ToastVariant;
}

interface ToastsState {
  toasts: Toast[];
}

const initialState: ToastsState = {
  toasts: [],
};

let nextId = 0;

const toastsSlice = createSlice({
  name: 'toasts',
  initialState,
  reducers: {
    addToast(state, action: PayloadAction<Omit<Toast, 'id'>>) {
      state.toasts.push({ ...action.payload, id: `toast-${++nextId}` });
    },
    removeToast(state, action: PayloadAction<string>) {
      state.toasts = state.toasts.filter((t) => t.id !== action.payload);
    },
    clearAllToasts(state) {
      state.toasts = [];
    },
  },
});

export const { addToast, removeToast, clearAllToasts } = toastsSlice.actions;

export function selectToasts(state: { toasts: ToastsState }) {
  return state.toasts.toasts;
}

export default toastsSlice.reducer;
