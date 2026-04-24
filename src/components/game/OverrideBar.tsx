import type { EncounterSnapshot } from '@/shared/domain/combat';
import type { GameplayOverrideCommand } from '@/shared/gameplay';

interface OverrideBarProps {
  encounter: EncounterSnapshot | null;
  onQueue: (command: GameplayOverrideCommand) => void;
}

export function OverrideBar({ encounter, onQueue }: OverrideBarProps) {
  const active = encounter?.status === 'active';
  const queued = encounter?.queuedOverrides.length ?? 0;

  return (
    <section className="panel play-panel play-panel--compact">
      <div className="panel-title">Field Override</div>
      {!active ? <p className="muted">Override actions unlock once the roots force you into combat.</p> : null}
      {active ? (
        <div className="play-card-stack">
          <p className={queued > 0 ? 'hint' : 'muted'}>
            {queued > 0
              ? `Action queued for the next hero turn. Current queue depth: ${queued}.`
              : 'Queue one action for the next hero turn.'}
          </p>
          <div className="override-row">
            <button className="secondary-button" disabled={queued > 0} onClick={() => onQueue('encounter power')} type="button">
              Encounter Power
            </button>
            <button className="secondary-button" disabled={queued > 0} onClick={() => onQueue('potion')} type="button">
              Potion
            </button>
            <button className="secondary-button" disabled={queued > 0} onClick={() => onQueue('retreat')} type="button">
              Retreat
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
