import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { ThemeProvider } from 'next-themes';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'KenyaWatch AI | Public Procurement Integrity',
  description: 'AI-powered fraud detection and transparency for Kenyan public contracts.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.className} bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 transition-colors`}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <nav className="border-b dark:border-gray-800 bg-white dark:bg-gray-950 p-4 sticky top-0 z-50">
            <div className="max-w-7xl mx-auto flex justify-between items-center">
              <h1 className="text-xl font-bold text-green-700 dark:text-green-400">🇰🇪 KenyaWatch AI</h1>
              <div className="space-x-4 text-sm font-medium">
                <a href="/" className="hover:text-green-600">Home</a>
                <a href="/scanner" className="hover:text-green-600">AI Scanner</a>
                <a href="/admin" className="hover:text-green-600">Admin</a>
              </div>
            </div>
          </nav>
          <main className="min-h-screen">{children}</main>
        </ThemeProvider>
      </body>
    </html>
  );
}
