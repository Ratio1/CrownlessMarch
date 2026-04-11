import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionFromRequest } from '@/server/auth/session';
import { getCStore } from '@/server/platform/cstore';
import { validatePointBuy } from '@/shared/domain/point-buy';
import { type CharacterRecord, characterClasses } from '@/shared/domain/types';
import { keys } from '@/shared/persistence/keys';

const createCharacterBodySchema = z.object({
  name: z.string().trim().min(3).max(24),
  classId: z.enum(characterClasses),
  attributes: z.object({
    strength: z.number().int().min(8).max(18),
    dexterity: z.number().int().min(8).max(18),
    constitution: z.number().int().min(8).max(18),
    intelligence: z.number().int().min(8).max(18),
    wisdom: z.number().int().min(8).max(18),
    charisma: z.number().int().min(8).max(18)
  })
});

export async function POST(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  try {
    const body = createCharacterBodySchema.parse(await request.json());
    const pointBuy = validatePointBuy(body.attributes);

    if (!pointBuy.valid) {
      return NextResponse.json(
        {
          error: `Invalid point-buy allocation (${pointBuy.spent}/22).`,
          spent: pointBuy.spent
        },
        { status: 400 }
      );
    }

    const hitPointBonus = Math.floor((body.attributes.constitution - 10) / 2);
    const maxHitPoints = Math.max(10, 12 + hitPointBonus);
    const character: CharacterRecord = {
      id: randomUUID(),
      accountId: session.accountId,
      name: body.name,
      classId: body.classId,
      level: 1,
      xp: 0,
      attributes: body.attributes,
      position: { x: 5, y: 5 },
      hitPoints: {
        current: maxHitPoints,
        max: maxHitPoints
      },
      inventory: ['rusted-sword'],
      equipped: { weapon: 'rusted-sword' },
      activeQuestIds: []
    };

    await getCStore().setJson(keys.character(character.id), character);
    return NextResponse.json({ character }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid character payload.' }, { status: 400 });
    }

    return NextResponse.json({ error: 'Failed to create character.' }, { status: 500 });
  }
}
