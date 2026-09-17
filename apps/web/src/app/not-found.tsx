import { buttonClass } from '@/components/ui';
import { Compass } from 'lucide-react';
import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-24 text-center">
      <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
        <Compass className="size-6" aria-hidden />
      </div>
      <h1 className="text-lg font-semibold text-slate-900">ไม่พบหน้าที่ต้องการ</h1>
      <p className="mt-1 max-w-sm text-sm text-slate-500">
        ลิงก์อาจถูกย้ายหรือถูกลบไปแล้ว กลับไปที่หน้าภาพรวมเพื่อเริ่มใหม่
      </p>
      <Link href="/" className={buttonClass('primary', 'md', 'mt-5')}>
        กลับหน้าภาพรวม
      </Link>
    </div>
  );
}
