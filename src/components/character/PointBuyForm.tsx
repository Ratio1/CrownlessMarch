'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  POINT_BUY_BUDGET,
  POINT_BUY_MAX_SCORE,
  POINT_BUY_MIN_SCORE,
  getDefaultAttributes,
  validatePointBuy,
} from '@/shared/domain/point-buy';
import { attributes, characterClasses, type AttributeSet, type CharacterClass } from '@/shared/domain/types';

function formatLabel(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function PointBuyForm({ allocationRequired = false }: { allocationRequired?: boolean }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [classId, setClassId] = useState<CharacterClass>('fighter');
  const [values, setValues] = useState<AttributeSet>(getDefaultAttributes());
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const pointBuy = validatePointBuy(values);
  const canSubmit = name.trim().length >= 3 && pointBuy.valid && !pending;

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    try {
      const response = await fetch('/api/characters', {
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
        setError(body.error ?? 'Failed to create character.');
        return;
      }

      router.replace('/play');
      router.refresh();
    } catch {
      setError('Failed to create character.');
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="panel character-card">
      <div className="eyebrow">Character creation</div>
      <h1>{allocationRequired ? 'Allocate Character' : 'Create Character'}</h1>
      <p className="lede">
        Start at 8 in each ability, then allocate up to {POINT_BUY_BUDGET} points using the simplified D20 rules,
        choose a class, and step into the Briar March.
      </p>

      <form className="stack" onSubmit={onSubmit}>
        <label className="field">
          <span>Character name</span>
          <input
            autoComplete="nickname"
            name="name"
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
            required
          />
        </label>

        <label className="field">
          <span>Class</span>
          <select
            className="field-select"
            name="classId"
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
            {pointBuy.spent}/{POINT_BUY_BUDGET}
          </strong>
          <span>Remaining</span>
          <strong>{pointBuy.remaining}</strong>
        </div>

        <div className="attribute-grid">
          {attributes.map((attribute) => (
            <label className="field" key={attribute}>
              <span>{formatLabel(attribute)}</span>
              <input
                min={POINT_BUY_MIN_SCORE}
                max={POINT_BUY_MAX_SCORE}
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
        {!error && !pointBuy.valid ? (
          <p className="error">This point-buy spread exceeds the {POINT_BUY_BUDGET} point budget.</p>
        ) : null}

        <button className="primary-button" disabled={!canSubmit} type="submit">
          {pending ? 'Forging hero...' : allocationRequired ? 'Apply Allocation' : 'Create Character'}
        </button>
      </form>
    </section>
  );
}
