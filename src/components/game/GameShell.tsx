'use client';

import Link from 'next/link';
import { useGameplaySocket } from '@/client/useGameplaySocket';
import { CharacterPanel } from './CharacterPanel';
import { CommandPanel } from './CommandPanel';
import { CombatLogPanel } from './CombatLogPanel';
import { MovementPad } from './MovementPad';
import { OverrideBar } from './OverrideBar';
import { QuestPanel } from './QuestPanel';
import { WorldField } from './WorldField';

function describeStatus(status: ReturnType<typeof useGameplaySocket>['status']) {
  switch (status) {
    case 'connecting':
      return 'binding to shard';
    case 'connected':
      return 'connected';
    case 'reconnecting':
      return 'reconnecting';
    case 'disconnected':
      return 'disconnected';
  }
}

export function GameShell({
  gameplayPath,
  versionLabel,
}: {
  gameplayPath: string;
  versionLabel: string;
}) {
  const { status, statusDetail, shardWorldInstanceId, snapshot, sendMove, sendOverride, sendCommand } = useGameplaySocket(gameplayPath);
  const encounter = snapshot?.encounter ?? null;
  const canMove = status === 'connected' && Boolean(snapshot) && !snapshot?.movementLocked;
  const canCommand = status === 'connected' && Boolean(snapshot);
  const primaryQuest = snapshot?.character.quests?.[0] ?? null;
  const objectiveFocus = snapshot?.objectiveFocus ?? null;

  return (
    <section className="play-shell">
      <header className="panel play-header">
        <div className="play-header__identity">
          <p className="eyebrow">Thornwrithe live field</p>
          <h1>Live field</h1>
        </div>

        <div className="play-header__status">
          <div className="status-line" aria-live="polite">
            <span className={`status-dot status-dot--${status}`} />
            <span>{describeStatus(status)}</span>
            <span className="status-separator">•</span>
            <span className="monospace">{shardWorldInstanceId ?? 'awaiting shard id'}</span>
          </div>
          <p className="muted">{statusDetail}</p>
        </div>

        <div className="play-header__chips">
          <span className="status-pill">Release {versionLabel}</span>
          <span className="status-pill">Region {snapshot?.regionId ?? 'binding'}</span>
          <span className="status-pill">
            Directive {objectiveFocus?.label ?? primaryQuest?.label ?? 'Hold until the shard settles'}
          </span>
        </div>

        {primaryQuest ? (
          <div className="play-header__directive">
            <div className="panel-title">Current directive</div>
            <strong>{objectiveFocus?.detail ?? primaryQuest.progress}</strong>
            {objectiveFocus ? (
              <div className="play-chip-row">
                <span className="status-pill">{objectiveFocus.stateLabel}</span>
                <span className="status-pill">
                  Target {objectiveFocus.target.x},{objectiveFocus.target.y}
                </span>
              </div>
            ) : null}
          </div>
        ) : null}

        {status === 'disconnected' ? (
          <div className="status-banner">
            <strong>The session is offline.</strong>
            <Link className="secondary-button" href="/">
              Return to entry
            </Link>
          </div>
        ) : null}
      </header>

      <section className="play-layout">
        <WorldField snapshot={snapshot} />

        <aside className="play-sidebar">
          <CharacterPanel snapshot={snapshot} />
          <CombatLogPanel encounter={encounter} status={status} activityLog={snapshot?.activityLog ?? []} />
          <QuestPanel snapshot={snapshot} />
          <div className="play-controls">
            <CommandPanel disabled={!canCommand} onCommand={sendCommand} />
            <MovementPad disabled={!canMove} onMove={sendMove} />
            <OverrideBar encounter={encounter} onQueue={sendOverride} />
          </div>
        </aside>
      </section>
    </section>
  );
}
