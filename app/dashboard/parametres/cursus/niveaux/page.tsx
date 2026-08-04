'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

import { Toast } from '@/app/dashboard/ipgei/_ui';
import BlocNiveaux from '../_niveaux';

export default function ParametresNiveauxPage() {
  const [toast, setToast] = useState<string | null>(null);
  const notifier = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2600); };

  return (
    <div className="space-y-5 max-w-5xl">
      <Link href="/dashboard/parametres/cursus"
            className="inline-flex items-center gap-1.5 text-sm text-iss-gray hover:text-[#006633] transition-colors">
        <ArrowLeft size={14} /> Cursus prépa
      </Link>
      <BlocNiveaux onNotifier={notifier} />
      <Toast message={toast} />
    </div>
  );
}
