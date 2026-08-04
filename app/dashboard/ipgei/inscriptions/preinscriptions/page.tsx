'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, ArrowLeft, Check, Inbox, Loader2, UserCheck, X } from 'lucide-react';

import { apiFetch } from '@/lib/api';
import { ToastContainer, useToast } from '@/components/ui/Toast';
import LoadingSkeleton from '@/components/ui/LoadingSkeleton';
import { Badge, CARTE, INPUT, SELECT, Vide } from '../../_ui';
import { anneeParDefaut } from '../../_annee';
import { useClassesSelect } from '@/lib/api/ipgei-hooks';

interface Preinscription {
  id:              number;
  numero_dossier:  string;
  nom_fr:          string;
  prenom_fr:       string;
  date_naissance:  string | null;
  telephone:       string;
  email:           string;
  serie_bac:       string;
  bac_moyenne:     string | null;
  mention_bac:     string;
  statut:          string;
  statut_display?: string;
  motif_rejet:     string;
  date_soumission: string;
}

const TONS: Record<string, 'bleu' | 'vert' | 'rouge' | 'ambre'> = {
  soumise:   'ambre',
  en_examen: 'ambre',
  acceptee:  'vert',
  rejetee:   'rouge',
  inscrite:  'bleu',
};

/**
 * Dossiers de candidature — examen et admission.
 *
 * Le circuit vient du socle : le candidat dépose son dossier sans compte, le
 * suit par son numéro, la scolarité l'examine. Ce qui est propre à l'IPGEI est
 * la dernière étape : convertir un dossier accepté en inscription de prépa,
 * avec sa classe, ses frais et sa maquette — la conversion du socle produit une
 * inscription LMD, qui n'apparaîtrait dans aucune grille de notes.
 */
export default function PreinscriptionsIPGEIPage() {
  const toast = useToast();
  const qc    = useQueryClient();
  const annee = anneeParDefaut();

  const [statut, setStatut]   = useState('soumise');
  const [aConvertir, setAConvertir] = useState<Preinscription | null>(null);
  const [classeId, setClasseId]     = useState<number | null>(null);
  const [motif, setMotif]           = useState('');
  const [aRejeter, setARejeter]     = useState<Preinscription | null>(null);

  const { data: classes = [] } = useClassesSelect({ annee_universitaire: annee, actif: true });

  const cle = ['ipgei', 'preinscriptions', statut] as const;
  const { data: dossiers = [], isLoading } = useQuery({
    queryKey: cle,
    queryFn:  () => apiFetch<{ results: Preinscription[] } | Preinscription[]>(
      '/api/v1/inscriptions/preinscriptions/',
      // « Tous » se traduit par l'absence de filtre, pas par une valeur vide :
      // `?statut=` demanderait les dossiers dont le statut est la chaîne vide.
      { params: { ...(statut ? { statut } : {}), page_size: 100 } },
    ).then(r => (Array.isArray(r) ? r : r.results ?? [])),
  });

  const rafraichir = () => qc.invalidateQueries({ queryKey: ['ipgei', 'preinscriptions'] });
  const echec = (e: unknown) => toast.error(e instanceof Error ? e.message : 'Erreur');

  const accepter = useMutation({
    mutationFn: (d: Preinscription) => apiFetch(
      `/api/v1/inscriptions/preinscriptions/${d.numero_dossier}/accepter/`, { method: 'POST' }),
    onSuccess: () => { rafraichir(); toast.success('Dossier accepté'); },
    onError: echec,
  });

  const rejeter = useMutation({
    mutationFn: () => apiFetch(
      `/api/v1/inscriptions/preinscriptions/${aRejeter!.numero_dossier}/rejeter/`,
      { method: 'POST', body: { motif_rejet: motif } }),
    onSuccess: () => {
      rafraichir(); toast.success('Dossier rejeté');
      setARejeter(null); setMotif('');
    },
    onError: echec,
  });

  const convertir = useMutation({
    mutationFn: () => apiFetch<{ matieres_inscrites: number }>(
      '/api/v1/ipgei/inscriptions/depuis-preinscription/',
      { method: 'POST', body: { preinscription: aConvertir!.id, classe: classeId } }),
    onSuccess: (r) => {
      rafraichir();
      toast.success(`Inscrit · ${r.matieres_inscrites} matière(s) rattachée(s)`);
      setAConvertir(null); setClasseId(null);
    },
    onError: echec,
  });

  return (
    <div className="max-w-6xl mx-auto space-y-5 p-2">
      <ToastContainer toasts={toast.toasts} onClose={toast.removeToast} />

      <div className="flex items-center gap-3">
        <Link href="/dashboard/ipgei/inscriptions"
              className="p-2 rounded-xl text-iss-gray hover:bg-gray-50 hover:text-iss-primary transition-colors">
          <ArrowLeft size={18} />
        </Link>
        <div className="w-10 h-10 rounded-xl flex items-center justify-center"
             style={{ background: 'linear-gradient(135deg, #004d24, #006633)' }}>
          <Inbox size={20} className="text-white" />
        </div>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-iss-dark">Pré-inscriptions</h1>
          <p className="text-sm text-iss-gray">Dossiers de candidature déposés en ligne</p>
        </div>
        <select value={statut} className={SELECT} style={{ maxWidth: 200 }}
                onChange={e => setStatut(e.target.value)}>
          <option value="soumise">À examiner</option>
          <option value="acceptee">Acceptés — à inscrire</option>
          <option value="inscrite">Inscrits</option>
          <option value="rejetee">Rejetés</option>
          <option value="">Tous</option>
        </select>
      </div>

      {isLoading ? (
        <div className={CARTE}><LoadingSkeleton rows={5} cols={5} className="p-6" /></div>
      ) : !dossiers.length ? (
        <div className={CARTE}>
          <Vide texte="Aucun dossier dans cet état." />
        </div>
      ) : (
        <div className={`${CARTE} overflow-hidden`}>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-iss-gray uppercase tracking-wider border-b border-gray-100">
                <th className="px-5 py-3 font-medium">Dossier</th>
                <th className="px-5 py-3 font-medium">Candidat</th>
                <th className="px-5 py-3 font-medium">Bac</th>
                <th className="px-5 py-3 font-medium">Déposé le</th>
                <th className="px-5 py-3 font-medium">Statut</th>
                <th className="px-5 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {dossiers.map(d => (
                <tr key={d.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="px-5 py-3 text-iss-gray font-mono text-xs">
                    {String(d.numero_dossier).slice(0, 8)}…
                  </td>
                  <td className="px-5 py-3">
                    <span className="font-semibold text-iss-dark">
                      {d.nom_fr} {d.prenom_fr}
                    </span>
                    <span className="block text-xs text-iss-gray">
                      {d.telephone || d.email || '—'}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-iss-gray">
                    {d.serie_bac || '—'}
                    {d.bac_moyenne && <> · {Number(d.bac_moyenne).toFixed(2)}</>}
                    {d.mention_bac && <> · {d.mention_bac}</>}
                  </td>
                  <td className="px-5 py-3 text-iss-gray">
                    {d.date_soumission?.slice(0, 10)}
                  </td>
                  <td className="px-5 py-3">
                    <Badge ton={TONS[d.statut] ?? 'bleu'}>
                      {d.statut_display ?? d.statut}
                    </Badge>
                    {d.motif_rejet && (
                      <span className="block text-xs text-iss-gray mt-0.5">{d.motif_rejet}</span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex justify-end gap-1">
                      {d.statut === 'soumise' && (
                        <>
                          <button onClick={() => accepter.mutate(d)} title="Accepter"
                                  className="p-1.5 rounded-lg text-iss-gray hover:bg-emerald-50 hover:text-emerald-700">
                            <Check size={15} />
                          </button>
                          <button onClick={() => setARejeter(d)} title="Rejeter"
                                  className="p-1.5 rounded-lg text-iss-gray hover:bg-red-50 hover:text-red-600">
                            <X size={15} />
                          </button>
                        </>
                      )}
                      {d.statut === 'acceptee' && (
                        <button onClick={() => setAConvertir(d)} title="Inscrire"
                                className="px-3 py-1.5 rounded-lg text-xs font-bold text-white flex items-center gap-1.5"
                                style={{ background: 'linear-gradient(135deg, #006633, #008844)' }}>
                          <UserCheck size={13} /> Inscrire
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {aRejeter && (
        <Modale titre="Rejeter le dossier" onFerme={() => setARejeter(null)}>
          <p className="text-sm text-iss-gray mb-3">
            {aRejeter.nom_fr} {aRejeter.prenom_fr}
          </p>
          {/* Le motif est rendu au candidat par le suivi public : le laisser
              vide, c'est un refus sans explication. */}
          <label className="text-xs font-medium text-slate-600 mb-1 block">
            Motif du rejet <span className="text-iss-gray">(visible par le candidat)</span>
          </label>
          <textarea value={motif} onChange={e => setMotif(e.target.value)} rows={3}
                    className={`${INPUT} h-auto py-2`} />
          <div className="flex justify-end mt-4">
            <button onClick={() => rejeter.mutate()} disabled={!motif.trim() || rejeter.isPending}
                    className="px-4 py-2 rounded-xl text-sm font-bold text-white bg-red-600 disabled:opacity-50">
              {rejeter.isPending ? 'Rejet…' : 'Rejeter'}
            </button>
          </div>
        </Modale>
      )}

      {aConvertir && (
        <Modale titre="Inscrire le candidat" onFerme={() => setAConvertir(null)}>
          <p className="text-sm text-iss-gray mb-3">
            {aConvertir.nom_fr} {aConvertir.prenom_fr}
          </p>
          <label className="text-xs font-medium text-slate-600 mb-1 block">Classe *</label>
          <select value={classeId ?? ''} className={SELECT}
                  onChange={e => setClasseId(e.target.value ? Number(e.target.value) : null)}>
            <option value="">— Choisir —</option>
            {classes.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
          </select>
          <p className="text-xs text-iss-gray mt-3 flex items-start gap-1.5">
            <AlertCircle size={13} className="mt-0.5 flex-shrink-0" />
            L&apos;identité du dossier est reprise telle quelle. Les frais et la
            maquette du niveau seront appliqués automatiquement.
          </p>
          <div className="flex justify-end mt-4">
            <button onClick={() => convertir.mutate()}
                    disabled={!classeId || convertir.isPending}
                    className="px-4 py-2 rounded-xl text-sm font-bold text-white flex items-center gap-1.5 disabled:opacity-50"
                    style={{ background: 'linear-gradient(135deg, #006633, #008844)' }}>
              {convertir.isPending
                ? <><Loader2 size={14} className="animate-spin" /> Inscription…</>
                : 'Inscrire'}
            </button>
          </div>
        </Modale>
      )}
    </div>
  );
}

function Modale({ titre, onFerme, children }: {
  titre: string; onFerme: () => void; children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className={`${CARTE} p-6 w-full`} style={{ maxWidth: 460 }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-iss-dark">{titre}</h3>
          <button onClick={onFerme} className="p-1.5 rounded-lg text-iss-gray hover:bg-gray-100">
            <X size={14} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
