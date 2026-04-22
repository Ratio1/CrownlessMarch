import type { ThornwritheVersionInfo } from '@/server/app-version';

export function ReleaseBadge({ version }: { version: ThornwritheVersionInfo }) {
  return (
    <a
      className="release-badge"
      href="/e"
      title={`Thornwrithe ${version.label}${version.commitSha ? ` (${version.commitSha})` : ''}`}
    >
      <span className="release-badge__label">Release</span>
      <span className="release-badge__value">{version.label}</span>
      {version.commitSha ? <span className="release-badge__commit">{version.commitSha}</span> : null}
    </a>
  );
}
