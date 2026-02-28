import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'CRM Jurídico Hub',
  description: 'Gestor de Atendimentos e Leads',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap" rel="stylesheet" />
      </head>
      <body className="font-sans antialiased text-gray-900 dark:text-gray-100 bg-white dark:bg-black">
        <Providers>
          <main className="min-h-screen flex flex-col">
            {children}
          </main>
        </Providers>
      </body>
    </html>
  );
}
