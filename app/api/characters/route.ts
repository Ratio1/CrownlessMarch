import {
  AccountServiceError,
  createCharacterForAccount,
  getAccountById,
  resetCharacterForAccount,
} from '../../../src/server/auth/account-service';
import { createSessionCookieValue, readSessionFromRequest } from '../../../src/server/auth/session';
import { validatePointBuy } from '../../../src/shared/domain/point-buy';
import { characterClasses, type AttributeSet, type CharacterClass } from '../../../src/shared/domain/types';

function isAttributeSet(value: unknown): value is AttributeSet {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;

  return (
    typeof record.strength === 'number' &&
    typeof record.dexterity === 'number' &&
    typeof record.constitution === 'number' &&
    typeof record.intelligence === 'number' &&
    typeof record.wisdom === 'number' &&
    typeof record.charisma === 'number'
  );
}

function isCharacterClass(value: unknown): value is CharacterClass {
  return typeof value === 'string' && (characterClasses as readonly string[]).includes(value);
}

export async function POST(request: Request) {
  const session = await readSessionFromRequest(request);

  if (!session) {
    return Response.json({ error: 'Authentication required.' }, { status: 401 });
  }

  let body: {
    name?: string;
    classId?: unknown;
    attributes?: unknown;
  };

  try {
    const payload = await request.json();

    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return Response.json({ error: 'Invalid character payload.' }, { status: 400 });
    }

    body = payload as {
      name?: string;
      classId?: unknown;
      attributes?: unknown;
    };
  } catch {
    return Response.json({ error: 'Invalid character payload.' }, { status: 400 });
  }

  if (!isCharacterClass(body.classId) || !isAttributeSet(body.attributes) || typeof body.name !== 'string') {
    return Response.json({ error: 'Invalid character payload.' }, { status: 400 });
  }

  const pointBuy = validatePointBuy(body.attributes);

  if (!pointBuy.valid) {
    return Response.json(
      {
        error: `Invalid point-buy allocation (${pointBuy.spent}/30).`,
        spent: pointBuy.spent,
      },
      { status: 400 }
    );
  }

  try {
    const currentAccount = await getAccountById(session.accountId);
    const allocationRequired = Boolean(currentAccount?.characterId && currentAccount.pointBuyRequired);
    const account = allocationRequired
      ? await resetCharacterForAccount({
          accountId: session.accountId,
          characterName: body.name,
          classId: body.classId,
          attributes: pointBuy.attributes,
        })
      : await createCharacterForAccount({
          accountId: session.accountId,
          characterName: body.name,
          classId: body.classId,
          attributes: pointBuy.attributes,
        });
    const response = Response.json(
      {
        character: {
          accountId: account.accountId,
          name: account.characterName,
          cid: account.characterId,
          classId: body.classId,
          attributes: pointBuy.attributes,
          pointBuyAllocated: allocationRequired,
        },
      },
      { status: allocationRequired ? 200 : 201 }
    );

    response.headers.set(
      'set-cookie',
      await createSessionCookieValue({
        accountId: account.accountId,
        characterId: account.characterId,
      })
    );

    return response;
  } catch (error) {
    if (error instanceof AccountServiceError && error.code === 'INVALID_INPUT') {
      return Response.json({ error: error.message }, { status: 400 });
    }

    if (error instanceof AccountServiceError && error.code === 'ACCOUNT_EXISTS') {
      return Response.json({ error: error.message }, { status: 409 });
    }

    if (error instanceof Error && error.message === 'SESSION_SECRET is required') {
      return Response.json({ error: 'Session configuration invalid' }, { status: 500 });
    }

    return Response.json({ error: 'Failed to create character.' }, { status: 500 });
  }
}
