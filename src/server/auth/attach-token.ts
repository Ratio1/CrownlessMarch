import { resolveAttachTokenSecret } from '../platform/runtime-env';

const ATTACH_TOKEN_TTL = '60s';

export interface AttachTokenPayload {
  accountId: string;
  characterId: string;
  issuedAt: string;
}

function getAttachSecret() {
  return new TextEncoder().encode(resolveAttachTokenSecret());
}

async function getJose() {
  return import('jose');
}

export async function issueAttachToken(payload: Omit<AttachTokenPayload, 'issuedAt'>) {
  const { SignJWT } = await getJose();
  const issuedAt = new Date().toISOString();

  const token = await new SignJWT({
    accountId: payload.accountId,
    characterId: payload.characterId,
    issuedAt,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(ATTACH_TOKEN_TTL)
    .sign(getAttachSecret());

  return {
    token,
    payload: {
      ...payload,
      issuedAt,
    },
  };
}

export async function verifyAttachToken(token: string): Promise<AttachTokenPayload> {
  const { jwtVerify } = await getJose();
  const { payload } = await jwtVerify(token, getAttachSecret());

  if (
    typeof payload.accountId !== 'string' ||
    typeof payload.characterId !== 'string' ||
    typeof payload.issuedAt !== 'string'
  ) {
    throw new Error('Invalid attach token');
  }

  return {
    accountId: payload.accountId,
    characterId: payload.characterId,
    issuedAt: payload.issuedAt,
  };
}
