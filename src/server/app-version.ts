import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';

export interface ThornwritheVersionInfo {
  game: 'thornwrithe';
  label: string;
  release: number;
  feature: number;
  build: number;
  packageVersion: string;
  commitSha: string | null;
  source: 'package' | 'env';
}

const VERSION_LABEL_PATTERN = /^(\d+)\.(\d+)\.(\d+)$/;

let cachedPackageVersion: string | null = null;

function readNonEmpty(...values: Array<string | undefined>) {
  for (const value of values) {
    const trimmed = value?.trim();

    if (trimmed) {
      return trimmed;
    }
  }

  return null;
}

function parseVersionLabel(label: string, sourceName: string) {
  const match = VERSION_LABEL_PATTERN.exec(label.trim());

  if (!match) {
    throw new Error(`${sourceName} must use RELEASE.FEATURE.BUILD format`);
  }

  return {
    label: `${Number(match[1])}.${Number(match[2])}.${Number(match[3])}`,
    release: Number(match[1]),
    feature: Number(match[2]),
    build: Number(match[3]),
  };
}

function readPackageVersion(cwd: string) {
  if (cachedPackageVersion) {
    return cachedPackageVersion;
  }

  const packageJsonPath = path.join(cwd, 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as {
    version?: unknown;
  };

  if (typeof packageJson.version !== 'string' || !packageJson.version.trim()) {
    throw new Error('package.json version is required');
  }

  cachedPackageVersion = packageJson.version.trim();
  return cachedPackageVersion;
}

function resolveCommitSha(env: NodeJS.ProcessEnv, cwd: string) {
  const explicit = readNonEmpty(env.THORNWRITHE_GIT_SHA, env.GIT_COMMIT, env.VERCEL_GIT_COMMIT_SHA);

  if (explicit) {
    return explicit.slice(0, 12);
  }

  try {
    return execSync('git rev-parse --short HEAD', {
      cwd,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString('utf8')
      .trim();
  } catch {
    return null;
  }
}

function resolveVersionLabel(env: NodeJS.ProcessEnv, cwd: string) {
  const explicitLabel = readNonEmpty(env.THORNWRITHE_VERSION);

  if (explicitLabel) {
    return {
      ...parseVersionLabel(explicitLabel, 'THORNWRITHE_VERSION'),
      source: 'env' as const,
    };
  }

  const release = readNonEmpty(env.THORNWRITHE_RELEASE);
  const feature = readNonEmpty(env.THORNWRITHE_FEATURE);
  const build = readNonEmpty(env.THORNWRITHE_BUILD);

  if (release || feature || build) {
    if (!release || !feature || !build) {
      throw new Error(
        'THORNWRITHE_RELEASE, THORNWRITHE_FEATURE, and THORNWRITHE_BUILD must all be set together'
      );
    }

    return {
      ...parseVersionLabel(`${release}.${feature}.${build}`, 'THORNWRITHE_RELEASE/FEATURE/BUILD'),
      source: 'env' as const,
    };
  }

  return {
    ...parseVersionLabel(readPackageVersion(cwd), 'package.json version'),
    source: 'package' as const,
  };
}

export function resolveThornwritheVersion(
  env: NodeJS.ProcessEnv = process.env,
  cwd: string = process.cwd()
): ThornwritheVersionInfo {
  const version = resolveVersionLabel(env, cwd);
  const packageVersion = readPackageVersion(cwd);

  return {
    game: 'thornwrithe',
    label: version.label,
    release: version.release,
    feature: version.feature,
    build: version.build,
    packageVersion,
    commitSha: resolveCommitSha(env, cwd),
    source: version.source,
  };
}

export function __resetVersionCacheForTests() {
  cachedPackageVersion = null;
}
