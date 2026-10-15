import type { usePlayer } from '../lib/usePlayer';

interface Props {
  player: ReturnType<typeof usePlayer>;
  started: boolean;
  onPlay?: () => void;
}

export function PlayerControls({ player, started, onPlay = player.play }: Props) {
  const { playing, finished, speed } = player;
  return (
    <>
      <button type="button" className="btn btn--primary" onClick={playing ? player.pause : onPlay}>
        {playing ? '❚❚ Pause' : finished ? '↺ Replay' : started ? '▶ Resume' : '▶ Play journey'}
      </button>
      <button
        type="button"
        className="btn"
        onClick={player.cycleSpeed}
        aria-label={`Animation speed ${speed} times. Change speed`}
      >
        {speed}×
      </button>
    </>
  );
}
