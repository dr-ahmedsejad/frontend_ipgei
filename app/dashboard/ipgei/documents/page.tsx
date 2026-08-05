'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Download, FileBadge, FilePlus, Search } from 'lucide-react';

import { Pagination } from '@/components/Pagination';
import {
  BTN_PRIMAIRE, Badge, CARTE, Chargement, DEGRADE, EnTetePage, Erreur, SELECT,
  Toast, Vide,
} from '../_ui';
import { useAnneeIPGEI } from '../_annee';
import { useDocumentsIPGEI } from '@/lib/api/ipgei-hooks';
import { documentsApi } from '@/lib/api/ipgei';
import { downloadBlob } from '@/lib/downloadBlob';
import type { TypeDocumentIPGEI } from '@/types/ipgei';

const TYPES: { value: TypeDocumentIPGEI | ''; label: string }[] = [
  { value: '',                            label: 'Tous les types' },
  { value: 'ipgei_releve_semestre',       label: 'Relevé de semestre' },
  { value: 'ipgei_releve_annuel',         label: 'Relevé annuel' },
  { value: 'ipgei_decision_deliberation', label: 'Décision de délibération' },
  { value: 'ipgei_attestation_cnim',      label: 'Attestation CNIM' },
];

export default function DocumentsIPGEIPage() {
  const { annee, setAnnee, options } = useAnneeIPGEI();
  const [page, setPage]           = useState(1);
  const [recherche, setRecherche] = useState('');
  const [type, setType]           = useState<TypeDocumentIPGEI | ''>('');

  const { data, isLoading, error } = useDocumentsIPGEI({
    page, search: recherche || undefined,
    annee_universitaire: annee || undefined,
    type_document: type || undefined,
  });

  const [toast]             = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const signaler = (e: unknown) => setErreur(e instanceof Error ? e.message : 'Erreur');

  const documents = data?.results ?? [];
  const total     = data?.count ?? 0;

  const telecharger = async (id: number, numero: string) => {
    try {
      downloadBlob(await documentsApi.telecharger(id), `${numero}.pdf`);
    } catch (e) { signaler(e); }
  };

  return (
    <div className="space-y-5 max-w-6xl">
      <EnTetePage
        icone={<FileBadge size={14} className="text-white" />}
        titre="Documents officiels"
        sousTitre="Registre des pièces émises — numérotées, scellées et vérifiables en ligne."
        actions={
          <Link href="/dashboard/ipgei/documents/generer"
                className={BTN_PRIMAIRE} style={{ background: DEGRADE }}>
            <FilePlus size={14} /> Générer un document
          </Link>
        }
      />

      {erreur && <Erreur erreur={new Error(erreur)} />}
      <Erreur erreur={error} />

      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-iss-gray pointer-events-none" />
          <input value={recherche} onChange={e => { setRecherche(e.target.value); setPage(1); }}
                 placeholder="N° de série, nom ou matricule…"
                 className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm bg-white focus:outline-none focus:border-[#006633] transition-all" />
        </div>
        <select value={annee} onChange={e => { setAnnee(e.target.value); setPage(1); }}
                className={SELECT} style={{ width: 140 }}>
          {options.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <select value={type} onChange={e => { setType(e.target.value as TypeDocumentIPGEI | ''); setPage(1); }}
                className={SELECT} style={{ width: 220 }}>
          {TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>

      <div className={`${CARTE} overflow-hidden`}>
        {isLoading && !data ? <Chargement /> : documents.length === 0 ? (
          <Vide texte="Aucun document émis pour ces filtres." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold text-iss-gray uppercase tracking-wide border-b border-gray-100">
                  <th className="px-4 py-3">N° de série</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Étudiant</th>
                  <th className="px-4 py-3">Année</th>
                  <th className="px-4 py-3">Émis le</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {documents.map(d => (
                  <tr key={d.id}>
                    <td className="px-4 py-3 font-bold text-iss-dark whitespace-nowrap">{d.numero_serie}</td>
                    <td className="px-4 py-3">
                      <Badge ton={d.type_document === 'ipgei_attestation_cnim' ? 'vert' : 'bleu'}>
                        {d.type_libelle.replace('IPGEI — ', '')}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-iss-dark">{d.etudiant_nom}</div>
                      <div className="text-xs text-iss-gray">{d.etudiant_matricule}</div>
                    </td>
                    <td className="px-4 py-3 text-iss-gray">{d.annee_universitaire}</td>
                    <td className="px-4 py-3 text-iss-gray whitespace-nowrap">
                      {new Date(d.date_generation).toLocaleDateString('fr-FR')}
                      {d.genere_par_nom && <div className="text-xs">par {d.genere_par_nom}</div>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => telecharger(d.id, d.numero_serie)} disabled={!d.a_pdf}
                              title={d.a_pdf ? 'Télécharger le PDF' : 'Aucun PDF stocké'}
                              className="p-2 rounded-lg text-iss-gray hover:bg-gray-100 hover:text-[#006633] disabled:opacity-40 transition-colors">
                        <Download size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {(data?.pages ?? 1) > 1 && (
          <div className="px-5 pb-4">
            <Pagination page={page} pages={data?.pages ?? 1} count={total} onPage={setPage} />
          </div>
        )}
      </div>

      <Toast message={toast} />
    </div>
  );
}

/**
 * Émission d'un relevé. Les décisions de jury et les attestations CNIM
 * s'émettent depuis l'écran de délibération, où la décision fait foi.
 */
