'use client';

import { useState } from 'react';
import { Download, FileBadge, FileText, Search } from 'lucide-react';

import { Pagination } from '@/components/Pagination';
import {
  BTN_PRIMAIRE, BTN_SECONDAIRE, Badge, CARTE, Chargement, DEGRADE, EnTetePage,
  Erreur, SELECT, Toast, Vide,
} from '../_ui';
import { useAnneeIPGEI } from '../_annee';
import {
  useClassesSelect, useDocumentMutations, useDocumentsIPGEI, useInscriptions,
  useSemestresAll,
} from '@/lib/api/ipgei-hooks';
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

  const [toast, setToast]   = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const notifier = (m: string) => { setToast(m); setTimeout(() => setToast(null), 3000); };
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
        sousTitre="Relevés, décisions de jury et attestations CNIM — numérotés, scellés et vérifiables en ligne."
      />

      {erreur && <Erreur erreur={new Error(erreur)} />}
      <Erreur erreur={error} />

      <EmissionReleve annee={annee} onNotifier={notifier} onErreur={signaler} />

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
function EmissionReleve({
  annee, onNotifier, onErreur,
}: { annee: string; onNotifier: (m: string) => void; onErreur: (e: unknown) => void }) {
  const [classe, setClasse]     = useState('');
  const [recherche, setRecherche] = useState('');
  const [inscriptionId, setInscriptionId] = useState<number | null>(null);
  const [semestreId, setSemestreId]       = useState<number | null>(null);

  const { data: classes = [] }   = useClassesSelect({ annee_universitaire: annee, actif: true });
  const { data: semestres = [] } = useSemestresAll({ annee_universitaire: annee });
  const { data: inscriptionsPage } = useInscriptions({
    page: 1, annee_universitaire: annee || '__aucune__',
    classe: classe ? Number(classe) : undefined,
    search: recherche || undefined, actif: true,
  });

  const inscriptions = inscriptionsPage?.results ?? [];
  const inscription  = inscriptions.find(i => i.id === inscriptionId);
  const semestresDuNiveau = inscription
    ? semestres.filter(s => s.niveau === inscription.niveau)
    : semestres;

  const mutations = useDocumentMutations();

  const emettre = (annuel: boolean) => {
    if (!inscriptionId) { onErreur(new Error('Choisissez un étudiant.')); return; }
    const nom = inscription?.etudiant_matricule ?? 'releve';
    if (annuel) {
      mutations.releveAnnuel.mutate(inscriptionId, {
        onSuccess: (b) => { downloadBlob(b, `releve-annuel-${nom}.pdf`); onNotifier('Relevé annuel émis'); },
        onError:   onErreur,
      });
    } else {
      if (!semestreId) { onErreur(new Error('Choisissez un semestre.')); return; }
      mutations.releveSemestre.mutate({ inscription: inscriptionId, semestre: semestreId }, {
        onSuccess: (b) => { downloadBlob(b, `releve-${nom}.pdf`); onNotifier('Relevé de semestre émis'); },
        onError:   onErreur,
      });
    }
  };

  return (
    <div className={`${CARTE} p-5`} style={{ borderLeft: '3px solid #006633' }}>
      <h3 className="text-sm font-bold text-iss-dark mb-1">Émettre un relevé</h3>
      <p className="text-xs text-iss-gray mb-4">
        Chaque émission crée un document numéroté au registre, avec son QR de vérification.
        Les décisions de jury et attestations CNIM s&apos;émettent depuis l&apos;écran de délibération.
      </p>

      <div className="grid gap-3 sm:grid-cols-3 mb-3">
        <div>
          <label className="block text-xs font-semibold text-iss-dark mb-1.5">Classe</label>
          <select value={classe} className={SELECT}
                  onChange={e => { setClasse(e.target.value); setInscriptionId(null); }}>
            <option value="">Toutes</option>
            {classes.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-semibold text-iss-dark mb-1.5">Étudiant</label>
          <input value={recherche} onChange={e => setRecherche(e.target.value)}
                 placeholder="Nom ou matricule…"
                 className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm bg-gray-50 focus:outline-none focus:bg-white focus:border-[#006633] transition-all" />
        </div>
      </div>

      <div className="max-h-40 overflow-y-auto rounded-xl border border-gray-200 divide-y divide-gray-100 mb-3">
        {inscriptions.length === 0 ? (
          <p className="px-3 py-4 text-sm text-iss-gray">Aucune inscription trouvée.</p>
        ) : inscriptions.map(i => (
          <button key={i.id} type="button" onClick={() => { setInscriptionId(i.id); setSemestreId(null); }}
                  className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                    inscriptionId === i.id ? 'bg-[#006633]/10 font-semibold text-[#006633]' : 'hover:bg-gray-50'
                  }`}>
            {i.etudiant_nom} <span className="text-iss-gray">· {i.etudiant_matricule} · {i.classe_nom}</span>
          </button>
        ))}
      </div>

      <div className="flex items-end gap-2 flex-wrap">
        <div>
          <label className="block text-xs font-semibold text-iss-dark mb-1.5">Semestre</label>
          <select value={semestreId ?? ''} className={SELECT} style={{ width: 150 }} disabled={!inscription}
                  onChange={e => setSemestreId(e.target.value ? Number(e.target.value) : null)}>
            <option value="">Choisir…</option>
            {semestresDuNiveau.map(s => <option key={s.id} value={s.id}>{s.code}</option>)}
          </select>
        </div>
        <button onClick={() => emettre(false)}
                disabled={!inscriptionId || !semestreId || mutations.releveSemestre.isPending}
                className={BTN_PRIMAIRE} style={{ background: DEGRADE }}>
          <FileText size={14} /> Relevé de semestre
        </button>
        <button onClick={() => emettre(true)}
                disabled={!inscriptionId || mutations.releveAnnuel.isPending}
                className={BTN_SECONDAIRE}>
          <FileText size={14} /> Relevé annuel
        </button>
      </div>
    </div>
  );
}
