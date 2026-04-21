import type { AdminDashboardData } from '@/server/admin/dashboard';

function formatTimestamp(value: string | null) {
  return value ?? 'never';
}

export function AdminDashboard({ data }: { data: AdminDashboardData }) {
  return (
    <section className="admin-dashboard">
      <section className="panel admin-summary">
        <div>
          <div className="eyebrow">Thornwrithe admin</div>
          <h1>Roster and shard state</h1>
        </div>
        <div className="admin-badges">
          <span className="admin-badge">{data.gameId}</span>
          <span className="admin-badge">{data.characters.length} PCs</span>
        </div>
      </section>

      <section className="panel admin-panel">
        <div className="panel-title">PC roster</div>
        <div className="admin-grid">
          {data.characters.map((character) => (
            <article className="admin-character-card" key={character.accountId}>
              <div className="admin-character-header">
                <div>
                  <h2>{character.characterName}</h2>
                  <p className="muted">{character.email}</p>
                </div>
                <span className={character.online ? 'status-pill status-pill--online' : 'status-pill'}>
                  {character.online ? 'online' : 'offline'}
                </span>
              </div>

              <dl className="admin-meta">
                <div>
                  <dt>Latest CID</dt>
                  <dd className="monospace">{character.latestCharacterCid}</dd>
                </div>
                <div>
                  <dt>Persist revision</dt>
                  <dd>{character.persistRevision}</dd>
                </div>
                <div>
                  <dt>Registered</dt>
                  <dd>{formatTimestamp(character.registeredAt)}</dd>
                </div>
                <div>
                  <dt>Last persisted</dt>
                  <dd>{formatTimestamp(character.lastPersistedAt)}</dd>
                </div>
                <div>
                  <dt>Shard host</dt>
                  <dd>{character.presence?.session_host_node_id ?? 'offline'}</dd>
                </div>
                <div>
                  <dt>Lease expires</dt>
                  <dd>{formatTimestamp(character.presence?.lease_expires_at ?? null)}</dd>
                </div>
              </dl>

              <div className="admin-json-block">
                <div className="label">PC card</div>
                {character.snapshotError ? (
                  <p className="error">{character.snapshotError}</p>
                ) : (
                  <pre>{JSON.stringify(character.snapshot, null, 2)}</pre>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="admin-hsets">
        <section className="panel admin-panel">
          <div className="panel-title">{data.rosterHkey}</div>
          <div className="admin-hset-rows">
            {data.rosterRows.map((row) => (
              <article className="admin-hset-row" key={`${data.rosterHkey}:${row.key}`}>
                <div className="admin-hset-row__header">
                  <span className="monospace">{row.key}</span>
                  <span className={row.status === 'ok' ? 'status-pill status-pill--online' : 'status-pill'}>
                    {row.status}
                  </span>
                </div>
                {row.error ? <p className="error">{row.error}</p> : null}
                <pre>{JSON.stringify(row.parsed, null, 2)}</pre>
              </article>
            ))}
          </div>
        </section>

        <section className="panel admin-panel">
          <div className="panel-title">{data.presenceHkey}</div>
          <div className="admin-hset-rows">
            {data.presenceRows.map((row) => (
              <article className="admin-hset-row" key={`${data.presenceHkey}:${row.key}`}>
                <div className="admin-hset-row__header">
                  <span className="monospace">{row.key}</span>
                  <span className={row.status === 'ok' ? 'status-pill status-pill--online' : 'status-pill'}>
                    {row.status}
                  </span>
                </div>
                {row.error ? <p className="error">{row.error}</p> : null}
                <pre>{JSON.stringify(row.parsed, null, 2)}</pre>
              </article>
            ))}
          </div>
        </section>
      </section>
    </section>
  );
}
