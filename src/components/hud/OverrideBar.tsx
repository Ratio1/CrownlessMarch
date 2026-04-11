'use client';

import { FormEvent, useState } from 'react';
import type { CombatStatus } from '@/shared/domain/combat';

interface OverrideBarProps {
  encounterId: string | null;
  encounterStatus: CombatStatus | null;
  pending: boolean;
  onQueue: (command: string) => Promise<boolean>;
}

export function OverrideBar({ encounterId, encounterStatus, pending, onQueue }: OverrideBarProps) {
  const [command, setCommand] = useState('');
  const isActionable = encounterStatus === 'active' && Boolean(encounterId);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = command.trim();
    if (!trimmed || !isActionable) {
      return;
    }
    const queued = await onQueue(trimmed);
    if (queued) {
      setCommand('');
    }
  }

  return (
    <section className="hud-panel">
      <h2>Field Override</h2>
      {isActionable ? <p>Issue a short command for the next combat turn.</p> : null}
      {isActionable ? (
        <form className="override-bar" onSubmit={onSubmit}>
          <input
            aria-label="Override command"
            value={command}
            onChange={(event) => setCommand(event.target.value)}
            disabled={pending}
            placeholder="e.g. guard, focus, retreat"
          />
          <button type="submit" disabled={!command.trim() || pending}>
            {pending ? 'Queueing...' : 'Queue'}
          </button>
        </form>
      ) : (
        <p>{encounterStatus ? 'Encounter resolved. Overrides are unavailable.' : 'No active encounter.'}</p>
      )}
    </section>
  );
}
