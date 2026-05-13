import { useState, useCallback } from 'react';

export function useScoreAnimation() {
  const [animatingA, setAnimatingA] = useState(false);
  const [animatingB, setAnimatingB] = useState(false);

  const triggerA = useCallback(() => {
    setAnimatingA(true);
    setTimeout(() => setAnimatingA(false), 300);
  }, []);

  const triggerB = useCallback(() => {
    setAnimatingB(true);
    setTimeout(() => setAnimatingB(false), 300);
  }, []);

  return { animatingA, animatingB, triggerA, triggerB };
}
