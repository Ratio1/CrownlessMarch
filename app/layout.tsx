import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Thornwrithe',
  description: 'A text-forward web MUD in a spreading ancient forest.'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
