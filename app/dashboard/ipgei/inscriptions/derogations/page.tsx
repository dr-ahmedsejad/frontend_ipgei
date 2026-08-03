'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, ArrowLeft, Ban, FileWarning, Loader2, Plus, Search } from 'lucide-react';

import { apiFetch } from '@/lib/api';
import { listEtudiants } from '@/lib/api/absences';
import { ToastContainer, useToast } from '@/components/ui/Toast';
import LoadingSkeleton from '@/components/ui/LoadingSkeleton';
import { Badge, CARTE, INPUT, SELECT, Vide } from '../../_ui';
import { anneeParDefaut } from '../../_annee';
import { useAnneesUniv } from '@/lib/api/ipgei-frais';

interface Derogation {
  id:                    number;
  etudiant:              number;
  etudiant_nom?:         string;
  annee_univ:            number;
  annee_univ_label?:     string;
  type_derogation:       string;
  type_derogation_label?: string;
  motif:                 string;
  date_decision:         string;
  statut:                string;
}

/**
 * Dérogations — la voie tracée pour ce que la règle refuse.
 *
 * Le redoublement en 2e année se décide en jury. Quand celui-ci n'a pas statué,
 * ou que le droit est épuisé mais qu'une circonstance le justifie, une
 * dérogation d'inscription l'autorise. Elle est datée, motivée et signée : à la
 * différence d'un contournement en base, elle laisse une trace opposable.
 *
 * Elle ne lève jamais l'interdiction de redoubler la 1re année. Cette règle
 * n'admet pas d'exception, et l'ouvrir ici la rendrait négociable.
 */
export default function DerogationsIPGEIPage() {
  const toast = useToast();
  const qc    = useQueryClient();
  const annee = anneeParDefaut();

  const [ouvert, setOuvert]       = useState(false);
  const [recherche, setRecherche] = useState('');
  const [etudiant, setEtudiant]   = useState<{ id: number; nom: string } | null>(null);
  const [anneeId, setAnneeId]     = useState<number | null>(null);
  const [motif, setMotif]         = useState('');
  const [date, setDate]           = useState('');

  const cle = ['ipgei', 'derogations'] as const;
  const { data: derogations = [], isLoading } = useQuery({
    queryKey: cle,
    queryFn:  () => apiFetch<{ results: Derogation[] } | Derogation[]>(
      '/api/v1/inscriptions/derogations/', { params: { page_size: 100 } },
    ).then(r => (Array.isArray(r) ? r : r.results ?? [])),
  });

  const { data: annees = [] } = useAnneesUniv();

  const { data: etudiants = [] } = useQuery({
    queryKey: ['ipgei', 'etudiants-derogation', recherche] as const,
    queryFn:  () => listEtudiants({ search: recherche, page_size: 10 })
      .then(r => (Array.isArray(r) ? r : r.results ?? [])),
    enabled:  ouvert && recherche.trim().length >= 2,
  });

  const creer = useMutation({
    mutationFn: () => apiFetch<Derogation>('/api/v1/inscriptions/derogations/', {
      method: 'POST',
      body: {
        etudiant: etudiant!.id,
        annee_univ: anneeId,
        type_derogation: 'derogation_inscription',
        motif,
        date_decision: date || new Date().toISOString().slice(0, 10),
        statut: 'actif',
      },
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: cle });
      toast.success('Dérogation accordée');
      setOuvert(false); setEtudiant(null); setMotif(''); setDate(''); setRecherche('');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Erreur'),
  });

  const annuler = useMutation({
    mutationFn: (id: number) => apiFetch<Derogation>(
      `/api/v1/inscriptions/derogations/${id}/`,
      { method: 'PATCH', body: { statut: 'annule' } },
    ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: cle });
      toast.success('Dérogation annulée');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Erreur'),
  });

  return (
    <div className="max-w-5xl mx-auto space-y-5 p-2">
      <ToastContainer toasts={toast.toasts} onClose={toast.removeToast} />

      <div className="flex items-center gap-3">
        <Link href="/dashboard/ipgei/inscriptions"
              className="p-2 rounded-xl text-iss-gray hover:bg-gray-50 hover:text-iss-primary transition-colors">
          <ArrowLeft size={18} />
        </Link>
        <div className="w-10 h-10 rounded-xl flex items-center justify-center"
             style={{ background: 'linear-gradient(135deg, #004d24, #006633)' }}>
          <FileWarning size={20} className="text-white" />
        </div>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-iss-dark">Dérogations</h1>
          <p className="text-sm text-iss-gray">Autorisations d&apos;inscription hors règle</p>
        </div>
        <button onClick={() => { setOuvert(o => !o); setAnneeId(anneeId ?? annees.find(a => a.annee === annee)?.id ?? null); }}
                className="px-4 py-2 rounded-xl text-sm font-bold text-white flex items-center gap-1.5"
                style={{ background: 'linear-gradient(135deg, #006633, #008844)' }}>
          <Plus size={14} /> Accorder
        </button>
      </div>

      {/* Ce que la dérogation peut, et ce qu'elle ne peut pas. Sans cela on la
          demande pour un cas qu'elle ne débloquera jamais. */}
      <p className="text-xs text-iss-gray bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 flex items-start gap-2">
        <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
        <span>
          Une dérogation d&apos;inscription autorise un redoublement en <strong>2e année</strong>
          {' '}lorsque le jury n&apos;a pas statué ou que le droit est épuisé. Elle ne lève
          jamais l&apos;interdiction de redoubler la <strong>1re année</strong>, qui n&apos;admet
          aucune exception.
        </span>
      </p>

      {ouvert && (
        <div className={`${CARTE} p-5 space-y-3`}>
          <h2 className="font-semibold text-iss-dark">Accorder une dérogation</h2>

          {etudiant ? (
            <div className="flex items-center justify-between rounded-xl border border-gray-200 px-3 py-2">
              <span className="text-sm font-semibold text-iss-dark">{etudiant.nom}</span>
              <button onClick={() => setEtudiant(null)}
                      className="text-xs text-iss-gray underline underline-offset-2">
                changer
              </button>
            </div>
          ) : (
            <>
              <div className="relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-iss-gray" />
                <input value={recherche} onChange={e => setRecherche(e.target.value)}
                       placeholder="Rechercher l'étudiant…" className={`${INPUT} pl-9`} />
              </div>
              {recherche.trim().length >= 2 && (
                <div className="divide-y divide-gray-100 max-h-52 overflow-auto">
                  {etudiants.map((e: { id: number; nom_display?: string; nom?: string }) => (
                    <button key={e.id}
                            onClick={() => setEtudiant({ id: e.id, nom: e.nom_display ?? e.nom ?? '' })}
                            className="w-full text-left py-2 text-sm text-iss-dark hover:bg-gray-50/70">
                      {e.nom_display ?? e.nom}
                    </button>
                  ))}
                  {!etudiants.length && (
                    <p className="text-xs text-iss-gray py-2">Aucun étudiant trouvé.</p>
                  )}
                </div>
              )}
            </>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">
                Année universitaire
              </label>
              <select value={anneeId ?? ''} className={SELECT}
                      onChange={e => setAnneeId(e.target.value ? Number(e.target.value) : null)}>
                <option value="">— Choisir —</option>
                {annees.map(a => <option key={a.id} value={a.id}>{a.annee}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">
                Date de décision
              </label>
              <input type="date" value={date} className={INPUT}
                     onChange={e => setDate(e.target.value)} />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-600 mb-1 block">
              Motif <span className="text-iss-gray">(figure au dossier)</span>
            </label>
            <textarea value={motif} onChange={e => setMotif(e.target.value)} rows={2}
                      placeholder="Circonstance justifiant la dérogation…"
                      className={`${INPUT} h-auto py-2`} />
          </div>

          <div className="flex justify-end">
            <button onClick={() => creer.mutate()}
                    disabled={!etudiant || !anneeId || !motif.trim() || creer.isPending}
                    className="px-4 py-2 rounded-xl text-sm font-bold text-white flex items-center gap-1.5 disabled:opacity-50"
                    style={{ background: 'linear-gradient(135deg, #006633, #008844)' }}>
              {creer.isPending
                ? <><Loader2 size={14} className="animate-spin" /> Enregistrement…</>
                : 'Accorder la dérogation'}
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className={CARTE}><LoadingSkeleton rows={4} cols={4} className="p-6" /></div>
      ) : !derogations.length ? (
        <div className={CARTE}>
          <Vide texte="Aucune dérogation accordée." />
        </div>
      ) : (
        <div className={`${CARTE} overflow-hidden`}>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-iss-gray uppercase tracking-wider border-b border-gray-100">
                <th className="px-5 py-3 font-medium">Étudiant</th>
                <th className="px-5 py-3 font-medium">Année</th>
                <th className="px-5 py-3 font-medium">Type</th>
                <th className="px-5 py-3 font-medium">Motif</th>
                <th className="px-5 py-3 font-medium">Décidée le</th>
                <th className="px-5 py-3 font-medium">Statut</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {derogations.map(d => (
                <tr key={d.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="px-5 py-3 font-semibold text-iss-dark">
                    {d.etudiant_nom ?? `#${d.etudiant}`}
                  </td>
                  <td className="px-5 py-3 text-iss-gray">{d.annee_univ_label ?? '—'}</td>
                  <td className="px-5 py-3 text-iss-gray">
                    {d.type_derogation_label ?? d.type_derogation}
                  </td>
                  <td className="px-5 py-3 text-iss-gray">{d.motif}</td>
                  <td className="px-5 py-3 text-iss-gray">{d.date_decision}</td>
                  <td className="px-5 py-3">
                    <Badge ton={d.statut === 'actif' ? 'vert' : 'rouge'}>
                      {d.statut === 'actif' ? 'Active' : 'Annulée'}
                    </Badge>
                  </td>
                  <td className="px-5 py-3 text-right">
                    {d.statut === 'actif' && (
                      <button onClick={() => annuler.mutate(d.id)} title="Annuler"
                              className="p-1.5 rounded-lg text-iss-gray hover:bg-red-50 hover:text-red-600">
                        <Ban size={15} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
