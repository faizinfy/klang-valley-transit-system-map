import { useCallback, useEffect, useRef, useState } from 'react';

export const SPEEDS = [1, 2, 4];

/**
 * Drives a journey animation of `total` ms. `onFrame` is called every frame
 * while playing (and whenever `redraw` is called) with the current time.
 */
export function usePlayer(total: number, onFrame: (time: number, playing: boolean) => void) {
  const timeRef = useRef(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [finished, setFinished] = useState(false);
  const frame = useRef(onFrame);
  frame.current = onFrame;

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      timeRef.current = Math.min(total, timeRef.current + (now - last) * speed);
      last = now;
      frame.current(timeRef.current, true);
      if (timeRef.current >= total) {
        setPlaying(false);
        setFinished(true);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, total]);

  const play = useCallback(() => {
    if (timeRef.current >= total) {
      timeRef.current = 0;
      setFinished(false);
    }
    setPlaying(true);
  }, [total]);

  const pause = useCallback(() => setPlaying(false), []);
  const cycleSpeed = useCallback(() => setSpeed((s) => SPEEDS[(SPEEDS.indexOf(s) + 1) % SPEEDS.length]), []);
  const redraw = useCallback(() => frame.current(timeRef.current, false), []);
  const reset = useCallback(() => {
    timeRef.current = 0;
    setPlaying(false);
    setFinished(false);
  }, []);

  return { timeRef, playing, speed, finished, play, pause, cycleSpeed, redraw, reset };
}

export function usePrefersReducedMotion(): boolean {
  const query = '(prefers-reduced-motion: reduce)';
  const [reduced, setReduced] = useState(() => matchMedia(query).matches);
  useEffect(() => {
    const mq = matchMedia(query);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return reduced;
}
