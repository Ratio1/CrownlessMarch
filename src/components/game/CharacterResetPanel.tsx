'use client';

import { useEffect, useState } from 'react';
import { pointBuyBudgetForLevel, validatePointBuy } from '@/shared/domain/point-buy';
import { attributes, characterClasses, type AttributeSet, type CharacterClass } from '@/shared/domain/types';
import type { GameplayShardSnapshot } from '@/shared/gameplay';

interface CharacterResetPanelProps {
  snapshot: GameplayShardSnapshot | null;
}

const GRACEFUL_DISCONNECT_EVENT = 'thornwrithe:graceful-disconnect';

function formatLabel(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function cloneAttributes(values: AttributeSet): AttributeSet {
  return { ...values };
}

export function CharacterResetPanel({ snapshot }: CharacterResetPanelProps) {
  const card = snapshot?.character ?? null;
  const cardCid = card?.cid ?? null;
  const cardName = card?.name ?? '';
  const cardClassId = (card?.classId as CharacterClass | undefined) ?? 'fighter';
  const cardAttributes = card?.attributes ?? null;
  const [name, setName] = useState(card?.name ?? '');
  const [classId, setClassId] = useState<CharacterClass>((card?.classId as CharacterClass | undefined) ?? 'fighter');
  const [values, setValues] = useState<AttributeSet>(card ? cloneAttributes(card.attributes) : {
    strength: 10,
    dexterity: 10,
    constitution: 10,
    intelligence: 10,
    wisdom: 10,
    charisma: 10,
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const budget = pointBuyBudgetForLevel(card?.realLevel ?? 1);
  const pointBuy = validatePointBuy(values, budget);
  const canSubmit = Boolean(card) && name.trim().length >= 3 && pointBuy.valid && !pending;

  useEffect(() => {
    if (!cardCid || !cardAttributes) {
      return;
    }

    setName(cardName);
    setClassId(cardClassId);
    setValues(cloneAttributes(cardAttributes));
  }, [cardAttributes, cardCid, cardClassId, cardName]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    try {
      const response = await fetch('/api/characters/reset', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name,
          classId,
          attributes: values,
        }),
      });
      const body = (await response.json()) as { error?: string };

      if (!response.ok) {
        setError(body.error ?? 'Failed to reset character.');
        return;
      }

      window.dispatchEvent(new Event(GRACEFUL_DISCONNECT_EVENT));
      await new Promise((resolve) => window.setTimeout(resolve, 200));
      window.location.assign('/play');
    } catch {
      setError('Failed to reset character.');
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="panel play-panel character-reset-panel">
      <div className="panel-title">Beta Reset</div>
      {!card ? <p className="muted">No character checkpoint is loaded.</p> : null}
      {card ? (
        <form className="stack" onSubmit={onSubmit}>
          <label className="field">
            <span>Character name</span>
            <input value={name} onChange={(event) => setName(event.currentTarget.value)} />
          </label>
          <label className="field">
            <span>Class</span>
            <select
              className="field-select"
              value={classId}
              onChange={(event) => setClassId(event.currentTarget.value as CharacterClass)}
            >
              {characterClasses.map((entry) => (
                <option key={entry} value={entry}>
                  {formatLabel(entry)}
                </option>
              ))}
            </select>
          </label>
          <div className="point-buy-summary">
            <span>Points spent</span>
            <strong>
              {pointBuy.spent}/{budget}
            </strong>
          </div>
          <div className="attribute-grid character-reset-panel__attrs">
            {attributes.map((attribute) => (
              <label className="field" key={attribute}>
                <span>{attribute === 'constitution' ? 'Endurance' : formatLabel(attribute)}</span>
                <input
                  min={8}
                  max={18}
                  step={1}
                  type="number"
                  value={values[attribute]}
                  onChange={(event) =>
                    setValues((current) => ({
                      ...current,
                      [attribute]: Number(event.currentTarget.value),
                    }))
                  }
                />
              </label>
            ))}
          </div>
          {error ? <p className="error">{error}</p> : null}
          {!error && !pointBuy.valid ? <p className="error">This spread exceeds the level {card.realLevel} reset budget.</p> : null}
          <button className="primary-button" disabled={!canSubmit} type="submit">
            {pending ? 'Resetting...' : 'Reset Character'}
          </button>
        </form>
      ) : null}
    </section>
  );
}
