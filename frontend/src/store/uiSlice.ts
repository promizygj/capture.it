import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export interface Toast { id: number; kind: 'success' | 'error' | 'info'; message: string }

let nextId = 1;
const uiSlice = createSlice({
  name: 'ui',
  initialState: { toasts: [] as Toast[] },
  reducers: {
    toastAdded: {
      reducer(state, action: PayloadAction<Toast>) {
        state.toasts.push(action.payload);
      },
      prepare(kind: Toast['kind'], message: string) {
        return { payload: { id: nextId++, kind, message } };
      },
    },
    toastDismissed(state, action: PayloadAction<number>) {
      state.toasts = state.toasts.filter((t) => t.id !== action.payload);
    },
  },
});

export const { toastAdded, toastDismissed } = uiSlice.actions;
export default uiSlice.reducer;
