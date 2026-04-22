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
        <div className="quest-stack">
          {quests.map((quest) => (
            <article className="quest-card" key={quest.id}>
              <div className="quest-card__header">
                <strong>{quest.label}</strong>
                <span className="status-pill">
                  {quest.status === 'ready_to_turn_in' ? 'Ready To Turn In' : 'Active'}
                </span>
              </div>
              <p>{quest.progress}</p>
              <div className="play-chip-row">
                <span className="status-pill">Reward {quest.rewardXp} XP</span>
              </div>
              <p className="muted">{quest.objective}</p>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
