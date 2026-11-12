import { useCallback } from 'react';
import { useAppDispatch } from '../store';
import { toastAdded, toastDismissed } from '../store/uiSlice';

export function useToast() {
  const dispatch = useAppDispatch();
  return useCallback(
    (kind: 'success' | 'error' | 'info', message: string) => {
      const action = dispatch(toastAdded(kind, message));
      setTimeout(() => dispatch(toastDismissed(action.payload.id)), kind === 'error' ? 7000 : 4000);
    },
    [dispatch],
  );
}
