import { RoleProvider } from '@/components/role-provider';
import { Sidebar } from '@/components/sidebar';
import { Topbar } from '@/components/topbar';
import type { Metadata } from 'next';
import { IBM_Plex_Sans_Thai } from 'next/font/google';
import './globals.css';

/**
 * Thai-first typography. IBM Plex Sans Thai has real Thai metrics, so vowels
 * and tone marks stop colliding at small sizes in dense tables.
 *
 * next/font downloads the font at BUILD time, so the first `next build` needs
 * network access. Swap to a local font (next/font/local) for an offline build.
 */
const thaiFont = IBM_Plex_Sans_Thai({
  subsets: ['thai', 'latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-thai',
});

export const metadata: Metadata = {
  title: 'StockHub - ระบบจัดการสต็อกหลายช่องทาง',
  description: 'สต็อกกลางเดียว ใช้ร่วมกันทุกช่องทางขาย ตัดสต็อกจากไฟล์ออเดอร์ ต้นทุนแบบ FIFO',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className={thaiFont.variable}>
      <body>
        {/* RoleProvider must wrap everything: the sidebar, the top bar and every
            page read the current job position from it. */}
        <RoleProvider>
          <div className="flex h-screen overflow-hidden">
            <Sidebar />
            <div className="flex min-w-0 flex-1 flex-col">
              <Topbar />
              <main className="flex-1 overflow-y-auto px-4 py-5 lg:px-6">
                <div className="mx-auto w-full max-w-7xl">{children}</div>
              </main>
            </div>
          </div>
        </RoleProvider>
      </body>
    </html>
  );
}
