import { configureStore } from '@reduxjs/toolkit';
import { useDispatch, useSelector } from 'react-redux';
import { api } from './api';
import auth, { loggedOut } from './authSlice';
import ui from './uiSlice';

export const store = configureStore({
  reducer: { [api.reducerPath]: api.reducer, auth, ui },
  middleware: (gdm) => gdm().concat(api.middleware),
});

// Drop all cached server data when the session ends
let lastStatus = store.getState().auth.status;
store.subscribe(() => {
  const s = store.getState().auth.status;
  const prev = lastStatus;
  lastStatus = s; // update before dispatching, the reset below re-enters this listener
  if (s === 'anonymous' && prev === 'authenticated') store.dispatch(api.util.resetApiState());
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();
export { loggedOut };
