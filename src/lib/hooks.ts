import { useEffect, useState } from 'react';

const DESKTOP = '(min-width: 1024px)';

export function useIsDesktop(): boolean {
  const [desktop, setDesktop] = useState(() => window.matchMedia(DESKTOP).matches);
  useEffect(() => {
    const mq = window.matchMedia(DESKTOP);
    const onChange = () => setDesktop(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return desktop;
}

/** Runs `handler` when the shell's "+" button is pressed. */
export function useNewEvent(handler: () => void) {
  useEffect(() => {
    window.addEventListener('kn:new', handler);
    return () => window.removeEventListener('kn:new', handler);
  }, [handler]);
}

export const EASE = [0.16, 1, 0.3, 1] as const;
