import type { MoveDirection } from '@/client/hooks/useGameSnapshot';

interface MovementPadProps {
  disabled: boolean;
  moving: boolean;
  onMove: (direction: MoveDirection) => Promise<void>;
}

export function MovementPad({ disabled, moving, onMove }: MovementPadProps) {
  return (
    <section className="hud-panel">
      <h2>Movement</h2>
      <p>Navigate the visible grid. Movement locks while an encounter is active.</p>
      <div className="movement-pad">
        <button type="button" onClick={() => void onMove('north')} disabled={disabled || moving}>
          North
        </button>
        <div className="movement-pad__row">
          <button type="button" onClick={() => void onMove('west')} disabled={disabled || moving}>
            West
          </button>
          <button type="button" onClick={() => void onMove('east')} disabled={disabled || moving}>
            East
          </button>
        </div>
        <button type="button" onClick={() => void onMove('south')} disabled={disabled || moving}>
          South
        </button>
      </div>
    </section>
  );
}
