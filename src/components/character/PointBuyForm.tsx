'use client';

import { FormEvent, useState } from 'react';
import { validatePointBuy } from '@/shared/domain/point-buy';
import { attributes, characterClasses, type AttributeSet, type CharacterClass } from '@/shared/domain/types';

const initialAttributes: AttributeSet = {
  strength: 10,
  dexterity: 10,
  constitution: 10,
  intelligence: 10,
  wisdom: 10,
  charisma: 10
};

function toLabel(attributeName: string): string {
  return attributeName.charAt(0).toUpperCase() + attributeName.slice(1);
}

export function PointBuyForm() {
  const [name, setName] = useState('');
  const [classId, setClassId] = useState<CharacterClass>('fighter');
  const [attributeValues, setAttributeValues] = useState<AttributeSet>(initialAttributes);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const pointBuyState = validatePointBuy(attributeValues);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setPending(true);

    try {
      const response = await fetch('/api/characters', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name,
          classId,
          attributes: attributeValues
        })
      });

      const body = (await response.json()) as {
        error?: string;
        character?: { name: string; classId: string; id: string };
      };

      if (!response.ok) {
        setError(body.error ?? 'Unable to create character.');
        return;
      }

      if (body.character) {
        setMessage(`Character ${body.character.name} created as ${body.character.classId}.`);
      } else {
        setMessage('Character created.');
      }
    } catch {
      setError('Unable to create character.');
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="hero">
      <h2>Create Character</h2>
      <p>Allocate up to 22 points. Stats can range from 8 to 18.</p>
      <p>
        Current spend: {pointBuyState.spent} / 22
      </p>

      <form onSubmit={onSubmit}>
        <label htmlFor="character-name">Character Name</label>
        <input id="character-name" value={name} onChange={(event) => setName(event.target.value)} />

        <label htmlFor="character-class">Class</label>
        <select
          id="character-class"
          value={classId}
          onChange={(event) => setClassId(event.target.value as CharacterClass)}
        >
          {characterClasses.map((classOption) => (
            <option key={classOption} value={classOption}>
              {toLabel(classOption)}
            </option>
          ))}
        </select>

        {attributes.map((attributeName) => (
          <div key={attributeName}>
            <label htmlFor={`attribute-${attributeName}`}>{toLabel(attributeName)}</label>
            <input
              id={`attribute-${attributeName}`}
              type="number"
              min={8}
              max={18}
              value={attributeValues[attributeName]}
              onChange={(event) =>
                setAttributeValues((previous) => ({
                  ...previous,
                  [attributeName]: Number(event.target.value)
                }))
              }
            />
          </div>
        ))}

        {error ? <p role="alert">{error}</p> : null}
        {message ? <p>{message}</p> : null}

        <button type="submit" disabled={pending || !pointBuyState.valid}>
          {pending ? 'Creating...' : 'Create Character'}
        </button>
      </form>
    </section>
  );
}
