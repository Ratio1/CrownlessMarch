process.env.THORNWRITHE_USE_FILE_CSTORE = process.env.THORNWRITHE_USE_FILE_CSTORE ?? '1';
process.env.THORNWRITHE_EXPOSE_VERIFICATION_TOKEN = process.env.THORNWRITHE_EXPOSE_VERIFICATION_TOKEN ?? '1';

import { loadContentBundle } from '@/server/content/load-content';
import { type AccountRecord, AccountServiceError, loginAccount, registerAccount, verifyAccountEmail } from '@/server/auth/account-service';
import { getCStore } from '@/server/platform/cstore';
import { keys } from '@/shared/persistence/keys';

const DEMO_ACCOUNT = {
  username: 'demo-ranger',
  email: 'demo-ranger@thornwrithe.local',
  password: 'ThornwritheDemo!2026'
};

interface StarterMobRecord {
  id: string;
  templateId: string;
  label: string;
  level: number;
  regionId: string;
  position: { x: number; y: number };
  state: 'idle';
  seededAt: string;
}

async function main() {
  const account = await ensureDemoAccount();
  const mobs = await seedStarterMobs();
  const output = {
    account: {
      id: account.id,
      username: account.username,
      email: account.email,
      activeCharacterId: account.activeCharacterId ?? null
    },
    starterMobIds: mobs.map((mob) => mob.id),
    cstoreMode: process.env.THORNWRITHE_USE_FILE_CSTORE === '1' ? 'file' : 'edge',
    cstoreFile: process.env.THORNWRITHE_CSTORE_FILE ?? '.thornwrithe/cstore.local.json',
    demoCredentials: {
      username: DEMO_ACCOUNT.username,
      password: DEMO_ACCOUNT.password
    }
  };

  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

async function ensureDemoAccount(): Promise<AccountRecord> {
  try {
    const registration = await registerAccount(DEMO_ACCOUNT);
    const verified = await verifyAccountEmail(registration.verificationToken);
    return resetActiveCharacter(verified);
  } catch (error) {
    if (!(error instanceof AccountServiceError)) {
      throw error;
    }

    if (error.code !== 'ACCOUNT_EXISTS') {
      throw error;
    }

    const login = await loginAccount({
      username: DEMO_ACCOUNT.username,
      password: DEMO_ACCOUNT.password
    });
    return resetActiveCharacter(login.account);
  }
}

async function resetActiveCharacter(account: AccountRecord): Promise<AccountRecord> {
  const normalized: AccountRecord = {
    ...account,
    activeCharacterId: undefined,
    updatedAt: new Date().toISOString()
  };
  await getCStore().setJson(keys.account(normalized.id), normalized);
  return normalized;
}

async function seedStarterMobs(): Promise<StarterMobRecord[]> {
  const content = await loadContentBundle(process.cwd());
  const regionId = content.region.id;
  const seededAt = new Date().toISOString();

  const templateById = new Map(content.monsters.map((monster) => [monster.id, monster]));
  const starterMobs: StarterMobRecord[] = [
    {
      id: 'starter-briar-goblin-1',
      templateId: 'briar-goblin',
      label: templateById.get('briar-goblin')?.label ?? 'Briar Goblin',
      level: templateById.get('briar-goblin')?.level ?? 1,
      regionId,
      position: { x: 6, y: 5 },
      state: 'idle',
      seededAt
    },
    {
      id: 'starter-briar-goblin-2',
      templateId: 'briar-goblin',
      label: templateById.get('briar-goblin')?.label ?? 'Briar Goblin',
      level: templateById.get('briar-goblin')?.level ?? 1,
      regionId,
      position: { x: 4, y: 4 },
      state: 'idle',
      seededAt
    },
    {
      id: 'starter-sap-wolf-1',
      templateId: 'sap-wolf',
      label: templateById.get('sap-wolf')?.label ?? 'Sap Wolf',
      level: templateById.get('sap-wolf')?.level ?? 2,
      regionId,
      position: { x: 3, y: 6 },
      state: 'idle',
      seededAt
    }
  ];

  for (const mob of starterMobs) {
    await getCStore().setJson(keys.mob(mob.id), mob);
  }

  return starterMobs;
}

void main().catch((error) => {
  process.stderr.write(`seed-dev failed: ${String(error)}\n`);
  process.exitCode = 1;
});
