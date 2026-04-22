import { resolveThornwritheVersion } from '../../src/server/app-version';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const version = resolveThornwritheVersion();
  const response = Response.json(
    {
      ok: true,
      game: version.game,
      version: version.label,
      release: version.release,
      feature: version.feature,
      build: version.build,
      packageVersion: version.packageVersion,
      commitSha: version.commitSha,
      source: version.source,
    },
    {
      status: 200,
      headers: {
        'cache-control': 'no-store',
      },
    }
  );

  response.headers.set('x-thornwrithe-version', version.label);
  response.headers.set('x-thornwrithe-release', String(version.release));
  response.headers.set('x-thornwrithe-feature', String(version.feature));
  response.headers.set('x-thornwrithe-build', String(version.build));

  if (version.commitSha) {
    response.headers.set('x-thornwrithe-commit', version.commitSha);
  }

  return response;
}
