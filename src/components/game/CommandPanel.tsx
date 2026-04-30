'use client';

import { FormEvent, useState } from 'react';
import type { GameplayMudCommand } from '@/shared/gameplay';

interface CommandPanelProps {
  disabled: boolean;
  onCommand: (command: GameplayMudCommand) => void;
}

export function CommandPanel({ disabled, onCommand }: CommandPanelProps) {
  const [command, setCommand] = useState('');

  function submitCommand(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextCommand = command.trim();

    if (!nextCommand || disabled) {
      return;
    }

    onCommand(nextCommand);
    setCommand('');
  }

  return (
    <section className="panel play-panel play-panel--compact command-panel">
      <div className="panel-title">Field Command</div>
      <form className="command-panel__form" onSubmit={submitCommand}>
        <label className="command-panel__label" htmlFor="mud-command">
          <span>&gt;</span>
          <input
            autoComplete="off"
            disabled={disabled}
            id="mud-command"
            name="command"
            onChange={(event) => setCommand(event.target.value)}
            placeholder="look / consider / search / north"
            type="text"
            value={command}
          />
        </label>
        <button className="secondary-button" disabled={disabled || !command.trim()} type="submit">
          Send
        </button>
      </form>
    </section>
  );
}
