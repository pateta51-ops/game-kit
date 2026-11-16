import { useSyncExternalStore } from 'react';

const sizeSub = (f: () => void) => {
  window.addEventListener('resize', f);
  return () => {
    window.removeEventListener('resize', f);
  };
};
// the scale that fits a w x h stage in the window, re-read on resize
export const useStageScale = (w: number, h: number): number =>
  useSyncExternalStore(sizeSub, () => Math.min(window.innerWidth / w, window.innerHeight / h), () => 1);
