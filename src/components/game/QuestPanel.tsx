import type { GameplayShardSnapshot } from '@/shared/gameplay';

interface QuestPanelProps {
  snapshot: GameplayShardSnapshot | null;
}

export function QuestPanel({ snapshot }: QuestPanelProps) {
  const quests = snapshot?.character.quests ?? [];

  return (
    <section className="panel play-panel">
      <div className="panel-title">Quest Ledger</div>
      {quests.length === 0 ? <p className="muted">No active shard quests. Follow the safest road you can find.</p> : null}
      {quests.length > 0 ? (
        <ul className="plain-list">
          {quests.map((quest) => (
            <li key={quest.id}>
              <strong>{quest.label}</strong>{' '}
              <span className="status-pill">
                {quest.status === 'ready_to_turn_in' ? 'Ready To Turn In' : 'Active'}
              </span>
              <div>{quest.progress}</div>
              <div className="muted">{quest.objective}</div>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
