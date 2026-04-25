import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Event Accommodation',
  description: 'Host/Guest coordination',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-slate-50 text-slate-900 min-h-screen">
        <main className="max-w-4xl mx-auto px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
