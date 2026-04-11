'use client';

import { useGameSnapshot } from '@/client/hooks/useGameSnapshot';
import { WorldCanvas } from '@/components/hud/WorldCanvas';
import { CombatLogPanel } from '@/components/hud/CombatLogPanel';
import { CharacterPanel } from '@/components/hud/CharacterPanel';
import { QuestPanel } from '@/components/hud/QuestPanel';
import { MovementPad } from '@/components/hud/MovementPad';
import { OverrideBar } from '@/components/hud/OverrideBar';

export default function PlayPage() {
  const { worldSnapshot, activeEncounter, loading, moving, overridePending, error, refresh, move, queueOverride } =
    useGameSnapshot();
  const encounterIsActive = activeEncounter?.status === 'active';

  return (
    <main className="play-shell">
      <header className="play-header">
        <p className="play-header__kicker">Shared shard // live field</p>
        <h1>Thornwrithe Field Interface</h1>
        <p>Traverse the visible wilds, read combat state from the side HUD, and keep the center clear for map flow.</p>
        <div className="play-header__status">
          <span>{loading ? 'Syncing world...' : 'World synced'}</span>
          <button type="button" onClick={() => void refresh()}>
            Refresh
          </button>
        </div>
        {error ? <p role="alert">{error}</p> : null}
      </header>

      <section className="play-layout">
        <WorldCanvas snapshot={worldSnapshot} />

        <aside className="play-sidebar">
          <CharacterPanel snapshot={worldSnapshot} encounter={activeEncounter} />
          <CombatLogPanel encounter={activeEncounter} loading={loading} />
          <QuestPanel snapshot={worldSnapshot} />
          <MovementPad disabled={encounterIsActive} moving={moving} onMove={move} />
          <OverrideBar
            encounterId={activeEncounter?.id ?? null}
            encounterStatus={activeEncounter?.status ?? null}
            pending={overridePending}
            onQueue={queueOverride}
          />
        </aside>
      </section>
    </main>
  );
}
