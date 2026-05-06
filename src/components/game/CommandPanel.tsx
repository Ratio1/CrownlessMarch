'use client';

import { FormEvent, useState } from 'react';
import type { GameplayMudCommand } from '@/shared/gameplay';

interface CommandPanelProps {
  disabled: boolean;
  combatMode?: boolean;
  onCommand: (command: GameplayMudCommand) => void;
}

const QUICK_COMMANDS: GameplayMudCommand[] = ['look', 'consider goblin', 'lore goblin', 'inventory'];

export function CommandPanel({ disabled, combatMode = false, onCommand }: CommandPanelProps) {
  const [command, setCommand] = useState('');
  const visibleQuickCommands = combatMode ? ['flee'] : QUICK_COMMANDS;

  function sendCommand(nextCommand: GameplayMudCommand) {
    if (!nextCommand.trim() || disabled) {
      return;
    }

    onCommand(nextCommand.trim());
    setCommand('');
  }

  function submitCommand(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextCommand = command.trim();

    sendCommand(nextCommand);
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
            placeholder={combatMode ? 'flee' : 'look / consider goblin / lore / inventory'}
            type="text"
            value={command}
          />
        </label>
        <button className="secondary-button" disabled={disabled || !command.trim()} type="submit">
          Send
        </button>
      </form>
      <div className="command-panel__quick" aria-label="Quick field commands">
        {visibleQuickCommands.map((quickCommand) => (
          <button
            className="secondary-button"
            disabled={disabled}
            key={quickCommand}
            onClick={() => sendCommand(quickCommand)}
            type="button"
          >
            {quickCommand}
          </button>
        ))}
      </div>
    </section>
  );
}
