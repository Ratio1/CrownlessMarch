import type { GameplayDirection } from '@/shared/gameplay';

interface MovementPadProps {
  disabled: boolean;
  onMove: (direction: GameplayDirection) => void;
}

export function MovementPad({ disabled, onMove }: MovementPadProps) {
  return (
    <section className="panel play-panel">
      <div className="panel-title">Movement</div>
      <p className="muted">Movement is shard-local. Durable progression only advances when the field resolves a checkpoint-worthy outcome.</p>
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
