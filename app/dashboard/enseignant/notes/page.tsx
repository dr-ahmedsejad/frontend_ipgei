'use client';

/**
 * Saisie de notes en ligne — l'écran de l'enseignant.
 *
 * CE QUI A CHANGÉ. Cet écran lisait `/api/v1/evaluations/sessions/` et
 * `/api/v1/evaluations/notes`, c'est-à-dire la couche LMD que l'IPGEI a
 * remplacée et dont les tables portent zéro ligne. Tout enseignant qui
 * l'ouvrait voyait une grille vide, sans erreur. Il lit désormais
 * `/api/v1/saisie-en-ligne/`, branché sur les vraies notes IPGEI.
 *
 * CE QU'IL ÉCRIT. Des BROUILLONS, jamais des notes. Cet écran sert sur le
 * miroir, restauré depuis le local à chaque publication : une note officielle
 * qui y naîtrait disparaîtrait sans bruit. La direction exporte le classeur,
 * puis saisit en local, où seule la note fait foi. L'écran le dit en toutes
 * lettres — un enseignant qui croirait ses notes définitives ne les
 * redemanderait jamais.
 *
 * Le périmètre vient de l'emploi du temps : un enseignant sans séance
 * planifiée n'a aucune feuille, et on le lui explique plutôt que de rendre une
 * page vide de plus.
 */
import { useMemo, useState } from 'react';
import { AlertCircle, BookOpen, Info, Lock, Save } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { getStoredUser } from '@/lib/auth';
import { useToast, ToastContainer } from '@/components/ui/Toast';

interface Feuille {
  classe:              number;
  classe_nom:          string;
  matiere:             number;
  matiere_code:        string;
  matiere_intitule:    string;
  semestre:            number;
  semestre_code:       string;
  annee_universitaire: string;
  seances:             number;
}

interface Case { valeur: string | null; brouillon: boolean }

interface Ligne {
  note:               number | null;
  inscription:        number;
  etudiant_matricule: string;
  etudiant_nom:       string;
  /** Faux quand la scolarité n'a pas encore ouvert la matière pour la classe. */
  ouverte:            boolean;
  ds:                 Case[];
  exam:               Case[];
  tp:                 Case | null;
}

interface Grille {
  classe_nom:       string;
  matiere_code:     string;
  matiere_intitule: string;
  semestre_code:    string;
  nb_ds:            number;
  nb_exam:          number;
  has_tp:           boolean;
  verrouille:       boolean;
  lignes:           Ligne[];
}

/** Une case en attente d'envoi : `${note}:${type}:${numero}` → texte saisi. */
type Brouillons = Record<string, string>;

const INPUT = 'w-16 border border-slate-200 rounded px-2 py-1 text-xs text-right '
            + 'tabular-nums focus:outline-none focus:ring-1 focus:ring-[#006633]/40';

const cle = (note: number, type: string, numero: number) => `${note}:${type}:${numero}`;

export default function NotesEnseignantPage() {
  const toast = useToast();
  const qc    = useQueryClient();
  const annee = getStoredUser()?.annee_universitaire ?? '';

  const [choisie, setChoisie]   = useState<Feuille | null>(null);
  const [saisies, setSaisies]   = useState<Brouillons>({});

  const { data: feuilles = [], isLoading: chargeFeuilles, error: erreurFeuilles } =
    useQuery({
      queryKey: ['saisie-en-ligne', 'mes-feuilles', annee] as const,
      queryFn:  () => apiFetch<Feuille[]>(
        `/api/v1/saisie-en-ligne/mes-feuilles/${annee ? `?annee_universitaire=${encodeURIComponent(annee)}` : ''}`),
    });

  const { data: grille, isLoading: chargeGrille } = useQuery({
    queryKey: ['saisie-en-ligne', 'feuille', choisie?.classe, choisie?.matiere,
               choisie?.semestre] as const,
    enabled:  !!choisie,
    queryFn:  () => apiFetch<Grille>(
      `/api/v1/saisie-en-ligne/feuille/?classe=${choisie!.classe}`
      + `&matiere=${choisie!.matiere}&semestre=${choisie!.semestre}`),
  });

  const enregistrer = useMutation({
    mutationFn: () => apiFetch<{ cree: number; efface: number; refus: string[] }>(
      '/api/v1/saisie-en-ligne/saisir-bulk/', {
      method: 'POST',
      body: JSON.stringify({
        classe: choisie!.classe, matiere: choisie!.matiere,
        semestre: choisie!.semestre,
        cases: Object.entries(saisies).map(([k, valeur]) => {
          const [note, type, numero] = k.split(':');
          return { note: Number(note), type, numero: Number(numero), valeur };
        }),
      }),
    }),
    onSuccess: bilan => {
      setSaisies({});
      qc.invalidateQueries({ queryKey: ['saisie-en-ligne', 'feuille'] });
      const parts = [];
      if (bilan.cree)   parts.push(`${bilan.cree} note(s) déposée(s)`);
      if (bilan.efface) parts.push(`${bilan.efface} effacée(s)`);
      toast.success(parts.join(', ') || 'Rien à envoyer.');
      // Les refus se disent SÉPARÉMENT : noyés dans le message de succès, ils
      // passeraient pour un détail alors qu'ils désignent des cases perdues.
      if (bilan.refus?.length) toast.error(bilan.refus.join(' ; '));
    },
    onError: (e: Error) => toast.error(e.message || "Échec de l'envoi."),
  });

  const enAttente = Object.keys(saisies).length;

  const valeurAffichee = (ligne: Ligne, type: string, numero: number, c: Case | null) => {
    if (ligne.note === null) return '';
    const k = cle(ligne.note, type, numero);
    return k in saisies ? saisies[k] : (c?.valeur ?? '');
  };

  const modifier = (ligne: Ligne, type: string, numero: number, texte: string) => {
    if (ligne.note === null) return;
    setSaisies(s => ({ ...s, [cle(ligne.note!, type, numero)]: texte }));
  };

  const colonnes = useMemo(() => {
    if (!grille) return [] as Array<{ type: string; numero: number; label: string }>;
    return [
      ...Array.from({ length: grille.nb_ds }, (_, i) => (
        { type: 'ds', numero: i + 1, label: `DS ${i + 1}` })),
      ...(grille.has_tp ? [{ type: 'tp', numero: 1, label: 'TP' }] : []),
      ...Array.from({ length: grille.nb_exam }, (_, i) => (
        { type: 'exam', numero: i + 1, label: `Examen ${i + 1}` })),
    ];
  }, [grille]);

  const caseDe = (ligne: Ligne, type: string, numero: number): Case | null =>
    type === 'tp' ? ligne.tp
                  : (type === 'ds' ? ligne.ds : ligne.exam)[numero - 1] ?? null;

  return (
    <div className="space-y-5">
      <ToastContainer toasts={toast.toasts} onClose={toast.removeToast} />

      <div>
        <h1 className="text-xl font-bold text-iss-dark">Saisie des notes</h1>
        <p className="text-sm text-iss-gray mt-1">
          Les matières que vous enseignez, telles que l&apos;emploi du temps les enregistre.
        </p>
      </div>

      {/* Dit une fois, clairement : ces notes ne sont pas définitives. Un
          enseignant qui croirait le contraire ne les redemanderait jamais. */}
      <div className="flex gap-3 rounded-xl border border-blue-200 bg-blue-50 p-3.5">
        <Info className="w-5 h-5 shrink-0 text-blue-700 mt-0.5" />
        <p className="text-sm text-blue-900 leading-relaxed">
          <b>Ce que vous saisissez ici est un brouillon.</b> Il est transmis à la
          scolarité, qui le reprend dans le système officiel. Tant qu&apos;elle ne
          l&apos;a pas fait, vous pouvez corriger ou effacer librement — une case
          vidée supprime le brouillon.
        </p>
      </div>

      {erreurFeuilles && (
        <div className="flex gap-2 rounded-xl border border-red-200 bg-red-50 p-3.5 text-sm text-red-800">
          <AlertCircle className="w-5 h-5 shrink-0" />
          {(erreurFeuilles as Error).message}
        </div>
      )}

      {/* ── Le choix de la feuille ──────────────────────────────────────── */}
      <div className="bg-white rounded-2xl shadow-card border border-gray-100 p-4">
        {chargeFeuilles ? (
          <p className="text-sm text-iss-gray">Chargement…</p>
        ) : feuilles.length === 0 ? (
          <div className="flex gap-3">
            <BookOpen className="w-5 h-5 shrink-0 text-iss-gray mt-0.5" />
            <p className="text-sm text-iss-gray leading-relaxed">
              Aucune feuille ne vous est rattachée{annee ? ` en ${annee}` : ''}.
              Le périmètre est établi depuis l&apos;emploi du temps : tant
              qu&apos;aucune séance ne vous y est affectée, il n&apos;y a rien à
              saisir. Signalez-le à la scolarité.
            </p>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {feuilles.map(f => {
              const active = choisie
                && choisie.classe === f.classe && choisie.matiere === f.matiere
                && choisie.semestre === f.semestre;
              return (
                <button
                  key={`${f.classe}-${f.matiere}-${f.semestre}`}
                  onClick={() => { setChoisie(f); setSaisies({}); }}
                  className={`text-left rounded-xl border px-3.5 py-2.5 transition ${
                    active ? 'border-[#006633] bg-[#006633]/5'
                           : 'border-gray-200 hover:border-gray-300'}`}>
                  <div className="text-sm font-semibold text-iss-dark">
                    {f.classe_nom} · {f.matiere_code}
                  </div>
                  <div className="text-xs text-iss-gray">
                    {f.matiere_intitule} — {f.semestre_code} {f.annee_universitaire}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── La grille ───────────────────────────────────────────────────── */}
      {choisie && (
        <div className="bg-white rounded-2xl shadow-card border border-gray-100 overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-3">
            <div className="text-sm font-semibold text-iss-dark">
              {grille ? `${grille.classe_nom} · ${grille.matiere_code} — ${grille.semestre_code}` : '…'}
            </div>
            <button
              onClick={() => enregistrer.mutate()}
              disabled={!enAttente || enregistrer.isPending || grille?.verrouille}
              className="inline-flex items-center gap-2 rounded-xl bg-[#006633] px-4 py-2
                         text-sm font-semibold text-white disabled:opacity-40">
              <Save className="w-4 h-4" />
              {enregistrer.isPending ? 'Envoi…'
                : enAttente ? `Envoyer ${enAttente} modification(s)` : 'Rien à envoyer'}
            </button>
          </div>

          {grille?.verrouille && (
            <div className="flex gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2.5
                            text-sm text-amber-900">
              <Lock className="w-4 h-4 shrink-0 mt-0.5" />
              Ce semestre est clôturé : la saisie y est fermée.
            </div>
          )}

          {chargeGrille ? (
            <p className="p-4 text-sm text-iss-gray">Chargement de la grille…</p>
          ) : !grille || grille.lignes.length === 0 ? (
            <p className="p-4 text-sm text-iss-gray">Aucun inscrit dans cette classe.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr className="text-left text-xs font-semibold uppercase tracking-wide text-iss-gray">
                    <th className="px-4 py-2.5">Étudiant</th>
                    {colonnes.map(c => (
                      <th key={`${c.type}${c.numero}`} className="px-2 py-2.5 text-center">
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {grille.lignes.map(ligne => (
                    <tr key={ligne.inscription} className={ligne.ouverte ? '' : 'bg-gray-50'}>
                      <td className="px-4 py-2">
                        <div className="font-medium text-iss-dark">{ligne.etudiant_nom}</div>
                        <div className="text-xs text-iss-gray">{ligne.etudiant_matricule}</div>
                      </td>
                      {colonnes.map(c => {
                        const cellule = caseDe(ligne, c.type, c.numero);
                        const k = ligne.note !== null ? cle(ligne.note, c.type, c.numero) : '';
                        const modifie = k in saisies;
                        return (
                          <td key={`${c.type}${c.numero}`} className="px-2 py-2 text-center">
                            <input
                              className={`${INPUT} ${
                                modifie ? 'border-[#006633] bg-[#006633]/5'
                                : cellule?.brouillon ? 'border-amber-400 bg-amber-50' : ''}`}
                              value={valeurAffichee(ligne, c.type, c.numero, cellule)}
                              disabled={!ligne.ouverte || grille.verrouille}
                              title={cellule?.brouillon
                                ? 'Brouillon en attente de reprise par la scolarité'
                                : undefined}
                              onChange={e => modifier(ligne, c.type, c.numero, e.target.value)} />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>

              <p className="px-4 py-3 text-xs text-iss-gray">
                <span className="inline-block w-3 h-3 rounded border border-amber-400 bg-amber-50 align-middle" />
                {' '}brouillon déjà déposé · {' '}
                <span className="inline-block w-3 h-3 rounded border border-[#006633] bg-[#006633]/5 align-middle" />
                {' '}modifié, pas encore envoyé. Une ligne grisée n&apos;est pas
                encore ouverte par la scolarité pour cette matière.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
