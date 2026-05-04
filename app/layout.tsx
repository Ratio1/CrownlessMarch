import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { ReleaseBadge } from '@/components/chrome/ReleaseBadge';
import { resolveThornwritheVersion } from '@/server/app-version';
import './globals.css';

export const metadata: Metadata = {
  title: 'Thornwrithe',
  description: 'A live D20 MUD tribute running on Ratio1 devnet shards.',
  icons: {
    icon: '/icon.svg',
    shortcut: '/icon.svg',
  },
};

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
