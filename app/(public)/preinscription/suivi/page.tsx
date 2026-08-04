'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { FileSearch, Search } from 'lucide-react';

/**
 * Saisie du numéro de dossier, porte d'entrée du suivi public.
 *
 * Sans cet écran, `/preinscription/suivi/[token]` n'était atteignable que par
 * le lien de la page de succès : un candidat revenu plus tard, sur une autre
 * machine ou après avoir fermé l'onglet, n'avait aucun moyen de retrouver son
 * dossier. Le numéro n'est pas vérifié ici — c'est la page de suivi qui répond,
 * et c'est elle qui est limitée en débit côté serveur.
 */
export default function SaisieNumeroDossierPage() {
  const router = useRouter();
  const [numero, setNumero] = useState('');

  function ouvrir(e: React.FormEvent) {
    e.preventDefault();
    const propre = numero.trim();
    if (propre) router.push(`/preinscription/suivi/${encodeURIComponent(propre)}`);
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4"
      style={{ background: 'linear-gradient(135deg, #f0f7f3 0%, #e8f4ec 100%)' }}>

      <div className="flex items-center gap-3 mb-8">
        <div className="w-12 h-12 rounded-xl flex items-center justify-center"
          style={{ background: 'linear-gradient(135deg, #004d24, #006633)' }}>
          <FileSearch size={24} className="text-white" />
        </div>
        <div>
          <p className="text-xl font-bold text-iss-dark">Suivi de dossier</p>
          <p className="text-sm text-iss-gray">Pré-inscription en classe préparatoire</p>
        </div>
      </div>

      <form onSubmit={ouvrir}
        className="w-full max-w-md bg-white rounded-2xl border border-gray-100 p-6 shadow-card space-y-4">
        <div className="space-y-1">
          <label htmlFor="numero" className="text-sm font-medium text-iss-dark-soft">
            Numéro de dossier
          </label>
          <input
            id="numero"
            value={numero}
            onChange={e => setNumero(e.target.value)}
            placeholder="ex. 3f2b8c4e-…"
            autoComplete="off"
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-iss-dark focus:outline-none focus:ring-2 focus:ring-iss-primary/30 focus:border-iss-primary transition-all"
          />
          <p className="text-xs text-iss-gray">
            Il vous a été communiqué à la soumission de votre dossier.
          </p>
        </div>

        <button type="submit" disabled={!numero.trim()}
          className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-sm font-bold text-white hover:opacity-90 disabled:opacity-50 transition-all"
          style={{ background: 'linear-gradient(135deg, #006633, #008844)' }}>
          <Search size={16} />
          Consulter mon dossier
        </button>
      </form>

      <p className="text-center text-xs text-iss-gray mt-6">
        Pas encore de dossier ?{' '}
        <Link href="/preinscription" className="text-iss-primary font-medium hover:underline">
          Déposer une demande
        </Link>
      </p>
    </div>
  );
}
