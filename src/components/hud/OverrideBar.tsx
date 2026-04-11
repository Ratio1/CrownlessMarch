'use client';

import { FormEvent, useState } from 'react';

interface OverrideBarProps {
  encounterId: string | null;
  pending: boolean;
  onQueue: (command: string) => Promise<void>;
}

export function OverrideBar({ encounterId, pending, onQueue }: OverrideBarProps) {
  const [command, setCommand] = useState('');

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = command.trim();
    if (!trimmed || !encounterId) {
      return;
    }
    await onQueue(trimmed);
    setCommand('');
  }

  return (
    <section className="hud-panel">
      <h2>Field Override</h2>
      <p>Issue a short command for the next combat turn.</p>
      <form className="override-bar" onSubmit={onSubmit}>
        <input
          aria-label="Override command"
          value={command}
          onChange={(event) => setCommand(event.target.value)}
          disabled={!encounterId || pending}
          placeholder={encounterId ? 'e.g. guard, focus, retreat' : 'No active encounter'}
        />
        <button type="submit" disabled={!encounterId || !command.trim() || pending}>
          {pending ? 'Queueing...' : 'Queue'}
        </button>
      </form>
    </section>
  );
}
