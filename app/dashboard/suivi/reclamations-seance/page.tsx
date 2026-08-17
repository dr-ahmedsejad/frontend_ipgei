'use client';

import { useState } from 'react';
import {
  keepPreviousData, useMutation, useQuery, useQueryClient,
} from '@tanstack/react-query';
import {
  CalendarX2, CheckCircle2, Clock, MessageSquareWarning, XCircle,
} from 'lucide-react';

import { apiFetch } from '@/lib/api';
import { Pagination } from '@/components/Pagination';
import { ToastContainer, useToast } from '@/components/ui/Toast';
import { formatDateTime } from '@/lib/formatters';

/**
 * Réclamations de séances — ce que les enseignants contestent depuis le portail.
 *
 * Ces lignes n'ont pas d'équivalent local : elles sont nées en ligne, dans une
 * table exclue de la synchronisation. La direction les tranche ici, puis corrige
 * le suivi côté local — accepter une réclamation ne repointe pas la séance, cela
 * dit seulement que l'enseignant a raison.
 */

interface ReclamationSeance {
  id:                  number;
  prof_nom:            string;
  annee_universitaire: string;
  numero_semaine:      number;
  em_code:             string;
  em_intitule:         string;
  jour:                string;
  creneau:             string;
  date_seance:         string | null;
  commentaire_origine: string;
  motif:               string;
  statut:              'en_attente' | 'acceptee' | 'rejetee';
  reponse:             string;
  traite_par_nom:      string;
  date_soumission:     string;
  date_traitement:     string | null;
}

/** Ce que rend la route : l'enveloppe paginée du socle, ou une liste nue. */
type Enveloppe =
  | ReclamationSeance[]
  | { count: number; pages: number; results: ReclamationSeance[] };

const FILTRES = [
  { cle: 'en_attente', label: 'En attente', Icone: Clock },
  { cle: 'acceptee',   label: 'Acceptées',  Icone: CheckCircle2 },
  { cle: 'rejetee',    label: 'Rejetées',   Icone: XCircle },
  { cle: '',           label: 'Toutes',     Icone: MessageSquareWarning },
] as const;

const TEINTES: Record<string, string> = {
  en_attente: 'bg-amber-50 text-amber-700 border-amber-200',
  acceptee:   'bg-emerald-50 text-emerald-700 border-emerald-200',
  rejetee:    'bg-red-50 text-red-700 border-red-200',
};

export default function ReclamationsSeancePage() {
  const toast = useToast();
  const qc = useQueryClient();
  const [statut, setStatut] = useState<string>('en_attente');
  const [page, setPage]     = useState(1);
  const [aTrancher, setATrancher] = useState<
    { reclamation: ReclamationSeance; decision: 'acceptee' | 'rejetee' } | null>(null);
  const [reponse, setReponse] = useState('');

  // L'endpoint est un ViewSet : il rend l'enveloppe paginée du socle, pas un
  // tableau. Le lire comme une liste faisait échouer `.map` sur un objet — et
  // avant lui `.length`, qui valait `undefined` et ne déclenchait donc même pas
  // l'écran vide. On accepte les deux formes : le jour où la pagination serait
  // retirée de cette route, l'écran continuerait de fonctionner.
  const { data: reponseListe, isLoading } = useQuery({
    queryKey: ['reclamations', 'seances', statut, page] as const,
    queryFn:  () => {
      const params = new URLSearchParams({ page: String(page) });
      if (statut) params.set('statut', statut);
      return apiFetch<Enveloppe>(`/api/v1/reclamations/seances/?${params}`);
    },
    placeholderData: keepPreviousData,
  });
  const reclamations = Array.isArray(reponseListe)
    ? reponseListe : (reponseListe?.results ?? []);
  const total = Array.isArray(reponseListe)
    ? reponseListe.length : (reponseListe?.count ?? 0);
  const pages = Array.isArray(reponseListe) ? 1 : (reponseListe?.pages ?? 1);

  const traiter = useMutation({
    mutationFn: ({ id, decision, texte }:
                 { id: number; decision: string; texte: string }) =>
      apiFetch(`/api/v1/reclamations/seances/${id}/traiter/`, {
        method: 'POST', body: { statut: decision, reponse: texte },
      }),
    onSuccess: () => {
      toast.success('Réclamation traitée.');
      setATrancher(null);
      setReponse('');
      qc.invalidateQueries({ queryKey: ['reclamations', 'seances'] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Erreur.'),
  });

  return (
    <div className="space-y-5 max-w-5xl">
      <ToastContainer toasts={toast.toasts} onClose={toast.removeToast} />

      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
             style={{ background: 'linear-gradient(135deg,#004d24,#006633)' }}>
          <CalendarX2 size={16} className="text-white" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-iss-dark">Réclamations de séances</h1>
          <p className="text-xs text-iss-gray">
            Séances « Non fait » contestées par les enseignants depuis le portail
            en ligne.
          </p>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        {FILTRES.map(({ cle, label, Icone }) => (
          <button key={label} onClick={() => { setStatut(cle); setPage(1); }}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs
                              font-semibold border transition-colors ${
                    statut === cle
                      ? 'border-[#006633] text-[#006633] bg-[#006633]/[0.06]'
                      : 'border-gray-200 text-iss-gray hover:bg-gray-50'}`}>
            <Icone size={13} /> {label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="text-sm text-iss-gray">Lecture…</p>
      ) : reclamations.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-card border border-gray-100 p-8 text-center">
          <p className="text-sm text-iss-gray">
            Aucune réclamation {statut === 'en_attente' ? 'en attente' : 'dans cette catégorie'}.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {reclamations.map(reclamation => (
            <div key={reclamation.id}
                 className="bg-white rounded-2xl shadow-card border border-gray-100 p-4 space-y-2">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold text-iss-dark">
                      {reclamation.em_code || '—'}
                    </span>
                    <span className="text-xs text-iss-gray">{reclamation.em_intitule}</span>
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-lg border
                                      ${TEINTES[reclamation.statut]}`}>
                      {reclamation.statut === 'en_attente' ? 'en attente'
                       : reclamation.statut === 'acceptee' ? 'acceptée' : 'rejetée'}
                    </span>
                  </div>
                  {/* La séance est décrite par sa clé naturelle : c'est avec elle
                      qu'on la retrouve dans le suivi, côté local. */}
                  <p className="text-xs text-iss-gray mt-1">
                    {reclamation.prof_nom} · semaine {reclamation.numero_semaine} ·{' '}
                    {reclamation.jour} {reclamation.creneau}
                    {reclamation.date_seance && ` · ${reclamation.date_seance}`}
                    {' · '}{reclamation.annee_universitaire}
                  </p>
                </div>
                {reclamation.statut === 'en_attente' && (
                  <div className="flex gap-2">
                    <button onClick={() => { setATrancher({ reclamation, decision: 'acceptee' }); setReponse(''); }}
                            className="px-3 py-1.5 rounded-xl text-xs font-semibold text-white"
                            style={{ background: 'linear-gradient(135deg,#006633,#008844)' }}>
                      Accepter
                    </button>
                    <button onClick={() => { setATrancher({ reclamation, decision: 'rejetee' }); setReponse(''); }}
                            className="px-3 py-1.5 rounded-xl text-xs font-semibold border
                                       border-red-200 text-red-600 hover:bg-red-50">
                      Rejeter
                    </button>
                  </div>
                )}
              </div>

              <p className="text-sm text-iss-dark bg-gray-50 rounded-xl px-3 py-2">
                {reclamation.motif}
              </p>

              {reclamation.statut !== 'en_attente' && (
                <p className="text-xs text-iss-gray">
                  {reclamation.reponse && <>« {reclamation.reponse} » — </>}
                  {reclamation.traite_par_nom}
                  {reclamation.date_traitement
                    && `, le ${formatDateTime(reclamation.date_traitement)}`}
                </p>
              )}
            </div>
          ))}
          {/* Dix par page côté serveur : sans ce pied, on ne verrait que les dix
              premières sans jamais savoir qu'il y en avait d'autres. */}
          {pages > 1 && (
            <Pagination page={page} pages={pages} count={total} onPage={setPage} />
          )}
        </div>
      )}

      {/* Trancher demande un mot : c'est lui que l'enseignant lira en retour, et
          la seule trace de ce qui a motivé la décision. */}
      {aTrancher && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5 space-y-3">
            <h2 className="text-sm font-bold text-iss-dark">
              {aTrancher.decision === 'acceptee' ? 'Accepter' : 'Rejeter'} la réclamation
            </h2>
            <p className="text-xs text-iss-gray">
              {aTrancher.reclamation.prof_nom} — {aTrancher.reclamation.em_code},
              semaine {aTrancher.reclamation.numero_semaine}.
              {aTrancher.decision === 'acceptee'
                && ' La séance devra être repointée sur le serveur local : cette'
                 + ' décision ne modifie pas le suivi.'}
            </p>
            <textarea value={reponse} onChange={e => setReponse(e.target.value)}
                      rows={3} placeholder="Réponse à l'enseignant (facultative)"
                      className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2
                                 focus:outline-none focus:border-[#006633]" />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setATrancher(null)}
                      className="px-3 py-1.5 rounded-xl text-xs font-semibold border
                                 border-gray-200 text-iss-gray hover:bg-gray-50">
                Annuler
              </button>
              <button onClick={() => traiter.mutate({
                        id: aTrancher.reclamation.id,
                        decision: aTrancher.decision,
                        texte: reponse,
                      })}
                      disabled={traiter.isPending}
                      className="px-3 py-1.5 rounded-xl text-xs font-semibold text-white disabled:opacity-60"
                      style={{ background: aTrancher.decision === 'acceptee'
                        ? 'linear-gradient(135deg,#006633,#008844)'
                        : 'linear-gradient(135deg,#C82020,#E03535)' }}>
                {traiter.isPending ? 'Envoi…' : 'Confirmer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
