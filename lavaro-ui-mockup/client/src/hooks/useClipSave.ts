import { useState, useCallback } from 'react';

export type ClipSaveState = 'idle' | 'saving' | 'saved';

export function useClipSave(onSaved?: () => void) {
  const [state, setState] = useState<ClipSaveState>('idle');

  const save = useCallback(() => {
    if (state !== 'idle') return;
    setState('saving');
    setTimeout(() => {
      setState('saved');
      onSaved?.();
      setTimeout(() => setState('idle'), 2000);
    }, 1500);
  }, [state, onSaved]);

  return { state, save };
}
