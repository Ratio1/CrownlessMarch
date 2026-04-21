'use client';

import Link from 'next/link';
import { useGameplaySocket } from '@/client/useGameplaySocket';

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

export function GameShell({ gameplayPath }: { gameplayPath: string }) {
  const { status, statusDetail, shardWorldInstanceId, snapshot, sendMove } =
    useGameplaySocket(gameplayPath);
  const characters = Object.values(snapshot?.characters ?? {});
  const canMove = status === 'connected' && characters.length > 0;

  return (
    <section className="shell">
      <section className="panel shell__status">
        <div>
          <div className="eyebrow">Thornwrithe play</div>
          <h1>Shard console</h1>
        </div>

        <div className="status-line" aria-live="polite">
          <span className={`status-dot status-dot--${status}`} />
          <span>{describeStatus(status)}</span>
          <span className="status-separator">•</span>
          <span className="monospace">
            {shardWorldInstanceId ?? 'awaiting shard id'}
          </span>
        </div>

        <p className="muted status-copy">{statusDetail}</p>

        {status === 'disconnected' ? (
          <div className="status-banner">
            <strong>The session is offline.</strong>
            <Link className="secondary-button" href="/">
              Return to entry
            </Link>
          </div>
        ) : null}
      </section>

      <section className="panel world-panel">
        <div className="panel-title">First shard snapshot</div>

        {characters.length > 0 ? (
          <ul className="roster">
            {characters.map((character) => (
              <li className="roster__item" key={character.cid}>
                <strong>{character.name ?? character.cid}</strong>
                <span className="muted">{character.cid}</span>
                <span className="monospace">
                  {character.position.x}, {character.position.y}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted world-panel__empty">
            Waiting for the first shard snapshot. If the host changes, the client
            will reattach and treat the new shard as a fresh session.
          </p>
        )}
      </section>

      <section className="panel controls-panel">
        <div className="panel-title">Move</div>
        <p className="muted controls-copy">
          Movement is shard-local and disposable in v1. Durable character
          progression survives through R1FS checkpoints, not through position
          restore.
        </p>

        <div className="dpad" aria-label="movement controls">
          <button disabled={!canMove} onClick={() => sendMove('north')} type="button">
            North
          </button>
          <button disabled={!canMove} onClick={() => sendMove('west')} type="button">
            West
          </button>
          <button disabled={!canMove} onClick={() => sendMove('east')} type="button">
            East
          </button>
          <button disabled={!canMove} onClick={() => sendMove('south')} type="button">
            South
          </button>
        </div>
      </section>
    </section>
  );
}
