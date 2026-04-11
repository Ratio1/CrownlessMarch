import type { WorldSnapshot } from '@/client/hooks/useGameSnapshot';

interface QuestPanelProps {
  snapshot: WorldSnapshot | null;
}

export function QuestPanel({ snapshot }: QuestPanelProps) {
  return (
    <section className="hud-panel">
      <h2>Quest Ledger</h2>
      {!snapshot ? <p>Receiving contracts from the wardens...</p> : null}
      {snapshot ? (
        <div>
          <p>Primary: Hold the field and map safe paths through the Briar March.</p>
          <p>Secondary: Scout tiles within your current vision window for new threat pockets.</p>
          <p>
            Current scan radius: <strong>{snapshot.vision.radius}</strong>
          </p>
        </div>
      ) : null}
    </section>
  );
}
