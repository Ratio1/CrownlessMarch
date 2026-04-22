import type { ReactNode } from 'react';
import { ReleaseBadge } from '@/components/chrome/ReleaseBadge';
import { resolveThornwritheVersion } from '@/server/app-version';
import './globals.css';

export default function RootLayout({ children }: { children: ReactNode }) {
  const version = resolveThornwritheVersion();

  return (
    <html lang="en">
      <body className="thornwrithe-ui">
        {children}
        <ReleaseBadge version={version} />
      </body>
    </html>
  );
}
