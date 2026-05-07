import type { GameplayDirection } from '@/shared/gameplay';

interface MovementPadProps {
  disabled: boolean;
  onMove: (direction: GameplayDirection) => void;
}

export function MovementPad({ disabled, onMove }: MovementPadProps) {
  return (
    <section className="panel play-panel play-panel--compact">
      <div className="panel-title">Movement</div>
      <div className="dpad" aria-label="Movement controls">
        <button disabled={disabled} onClick={() => onMove('north')} type="button">
          North
        </button>
        <button disabled={disabled} onClick={() => onMove('west')} type="button">
          West
        </button>
        <button disabled={disabled} onClick={() => onMove('east')} type="button">
          East
        </button>
        <button disabled={disabled} onClick={() => onMove('south')} type="button">
          South
        </button>
      </div>
    </section>
  );
}
