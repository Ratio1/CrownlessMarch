'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useGameplaySocket } from '@/client/useGameplaySocket';
import type { GameplayDirection } from '@/shared/gameplay';
import { CharacterPanel } from './CharacterPanel';
import { CharacterResetPanel } from './CharacterResetPanel';
import { CommandPanel } from './CommandPanel';
import { CombatLogPanel } from './CombatLogPanel';
import { MovementPad } from './MovementPad';
import { QuestPanel } from './QuestPanel';
import { WorldField } from './WorldField';

type GameView = 'field' | 'character' | 'quests';

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
  const { status, statusDetail, shardWorldInstanceId, snapshot, sendMove, sendCommand } = useGameplaySocket(gameplayPath);
  const [activeView, setActiveView] = useState<GameView>('field');
  const encounter = snapshot?.encounter ?? null;
  const fightActive = encounter?.status === 'active';
  const canMove = status === 'connected' && Boolean(snapshot) && !snapshot?.movementLocked;
  const canCommand = status === 'connected' && Boolean(snapshot);
  const tabs: Array<{ id: GameView; label: string }> = [
    { id: 'field', label: 'Field' },
    { id: 'character', label: 'Character Sheet' },
    { id: 'quests', label: 'Quests' },
  ];

  useEffect(() => {
    if (activeView !== 'field' || !canMove) {
      return;
    }

    const movementKeys: Record<string, GameplayDirection> = {
      ArrowUp: 'north',
      ArrowDown: 'south',
      ArrowLeft: 'west',
      ArrowRight: 'east',
    };

    function onKeyDown(event: KeyboardEvent) {
      const direction = movementKeys[event.key];

      if (!direction || event.repeat) {
        return;
      }

      const target = event.target;
      const element = target instanceof HTMLElement ? target : null;

      if (
        element?.closest('input, textarea, select, button') ||
        element?.isContentEditable
      ) {
        return;
      }

      event.preventDefault();
      sendMove(direction);
    }

    window.addEventListener('keydown', onKeyDown);

    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeView, canMove, sendMove]);

  return (
    <section className="play-shell">
      <header className="panel play-header">
        <div className="play-header__identity">
          <p className="eyebrow">Thornwrithe</p>
          <h1>{activeView === 'field' ? 'Live Field' : activeView === 'character' ? 'Character Sheet' : 'Quest Ledger'}</h1>
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

        <nav className="play-tabs" aria-label="Primary play tabs" role="tablist">
          {tabs.map((tab) => (
            <button
              aria-selected={activeView === tab.id}
              className={`secondary-button ${activeView === tab.id ? 'secondary-button--active' : ''}`}
              key={tab.id}
              onClick={() => setActiveView(tab.id)}
              role="tab"
              type="button"
            >
              {tab.label}
            </button>
          ))}
          <span className="status-pill">Release {versionLabel}</span>
        </nav>

        {status === 'disconnected' ? (
          <div className="status-banner">
            <strong>The session is offline.</strong>
            <Link className="secondary-button" href="/">
              Return to entry
            </Link>
          </div>
        ) : null}
      </header>

      {activeView === 'field' ? (
        <section className="play-layout" role="tabpanel">
          <WorldField snapshot={snapshot} />

          <aside className="play-sidebar">
            <CombatLogPanel encounter={encounter} status={status} activityLog={snapshot?.activityLog ?? []} />
            <div className="play-controls">
              <MovementPad disabled={!canMove} onMove={sendMove} />
              <CommandPanel disabled={!canCommand} combatMode={fightActive} onCommand={sendCommand} />
            </div>
          </aside>
        </section>
      ) : null}

      {activeView === 'character' ? (
        <section className="game-tab-panel" role="tabpanel">
          <CharacterPanel snapshot={snapshot} />
          <CharacterResetPanel snapshot={snapshot} />
        </section>
      ) : null}

      {activeView === 'quests' ? (
        <section className="game-tab-panel game-tab-panel--single" role="tabpanel">
          <QuestPanel snapshot={snapshot} />
        </section>
      ) : null}
    </section>
  );
}
