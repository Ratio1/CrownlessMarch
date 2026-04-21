'use client';

import { useState } from 'react';
import type { AdminDashboardData } from '@/server/admin/dashboard';

function formatTimestamp(value: string | null) {
  return value ?? 'never';
}

type AdminTab = 'pcs' | 'hsets';

const PCS_TAB_ID = 'thornwrithe-admin-tab-pcs';
const HSETS_TAB_ID = 'thornwrithe-admin-tab-hsets';
const PCS_PANEL_ID = 'thornwrithe-admin-panel-pcs';
const HSETS_PANEL_ID = 'thornwrithe-admin-panel-hsets';

export function AdminDashboard({ data }: { data: AdminDashboardData }) {
  const [activeTab, setActiveTab] = useState<AdminTab>('pcs');

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

      <section className="panel admin-panel admin-tabs-shell">
        <div className="admin-tablist" aria-label="Admin dashboard sections" role="tablist">
          <button
            aria-controls={PCS_PANEL_ID}
            aria-selected={activeTab === 'pcs'}
            className={activeTab === 'pcs' ? 'admin-tab admin-tab--active' : 'admin-tab'}
            id={PCS_TAB_ID}
            onClick={() => setActiveTab('pcs')}
            role="tab"
            type="button"
          >
            <span>PCs</span>
            <span className="admin-tab-count">{data.characters.length}</span>
          </button>

          <button
            aria-controls={HSETS_PANEL_ID}
            aria-selected={activeTab === 'hsets'}
            className={activeTab === 'hsets' ? 'admin-tab admin-tab--active' : 'admin-tab'}
            id={HSETS_TAB_ID}
            onClick={() => setActiveTab('hsets')}
            role="tab"
            type="button"
          >
            <span>Hsets</span>
            <span className="admin-tab-count">{data.rosterRows.length + data.presenceRows.length}</span>
          </button>
        </div>

        {activeTab === 'pcs' ? (
          <section
            aria-labelledby={PCS_TAB_ID}
            className="admin-tab-panel"
            id={PCS_PANEL_ID}
            role="tabpanel"
          >
            <div className="admin-panel-heading">
              <div className="panel-title">PC roster</div>
              <p className="admin-panel-copy">
                Checkpoint revision is Thornwrithe&apos;s save counter for that PC. It increments when a newer R1FS
                checkpoint is persisted.
              </p>
            </div>

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

                  <div className="admin-cid-block">
                    <div className="label">Latest checkpoint CID</div>
                    <code className="admin-cid-value">{character.latestCharacterCid}</code>
                  </div>

                  <dl className="admin-meta-grid">
                    <div className="admin-meta-item">
                      <dt>Checkpoint revision</dt>
                      <dd>{character.persistRevision}</dd>
                    </div>
                    <div className="admin-meta-item">
                      <dt>Shard host</dt>
                      <dd>{character.presence?.session_host_node_id ?? 'offline'}</dd>
                    </div>
                    <div className="admin-meta-item">
                      <dt>Registered</dt>
                      <dd>{formatTimestamp(character.registeredAt)}</dd>
                    </div>
                    <div className="admin-meta-item">
                      <dt>Last persisted</dt>
                      <dd>{formatTimestamp(character.lastPersistedAt)}</dd>
                    </div>
                    <div className="admin-meta-item admin-meta-item--full">
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
        ) : (
          <section
            aria-labelledby={HSETS_TAB_ID}
            className="admin-tab-panel"
            id={HSETS_PANEL_ID}
            role="tabpanel"
          >
            <div className="admin-panel-heading">
              <div className="panel-title">Thornwrithe hsets</div>
              <p className="admin-panel-copy">
                Raw CStore rows for Thornwrithe&apos;s durable PC roster and the live presence lease map.
              </p>
            </div>

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
                  {data.presenceRows.length > 0 ? (
                    data.presenceRows.map((row) => (
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
                    ))
                  ) : (
                    <p className="hint">No live presence rows.</p>
                  )}
                </div>
              </section>
            </section>
          </section>
        )}
      </section>
    </section>
  );
}
