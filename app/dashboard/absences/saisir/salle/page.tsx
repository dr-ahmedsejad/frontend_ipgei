'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft, Smartphone, Loader2, AlertCircle,
  Clock, MapPin, BookOpen, User, CheckCircle,
} from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { getStoredUser } from '@/lib/auth';
import { deptLabel as deptLabelPartage } from '@/lib/format-depts';
import {
  aujourdhuiIso, bilanParJour, garderChoix, jourAProposer, libelleBilan, libelleDates, lireChoix,
} from '@/lib/salle-appel';

interface Departement { id: number; nom: string; niveau_nom?: string | null; filiere_code?: string | null; is_container?: boolean; }

/* Libellé groupe « FILIERE - NIVEAU - GROUPE » (ex. LPSTAT - L1 - G1),
   identique aux autres selects (emplois/gerer, absences/saisir…). */
function deptLabel(d: Departement, tous?: Departement[]): string {
  // Règle partagée (`lib/format-depts`) : le code de filière tombe quand
  // l'établissement n'en a qu'un, le niveau quand le nom de la classe le porte
  // déjà. Dix écrans portaient chacun leur copie de cette composition.
  return deptLabelPartage(d, tous);
}

/* Une séance de la semaine, telle que la rend `presences/fiches-seances/` :
   dédoublonnée et triée par le serveur, avec le bilan de son appel. Une
   classe y amène aussi les séances de ses sous-groupes (ses TP). */
interface SeanceRow {
  id: number;
  jour_label: string | null;
  creneau_label: string | null;
  type_seance_label: string | null;
  prof_nom: string | null;
  em_intitule: string | null;
  salle_nom?: string | null;
  numero_semaine: number;
  departement: number | null;
  groupe?: string | null;
  sous_groupe?: boolean;
  date_suivie?: string | null;
  /* `saisi` faux tant que personne n'a fait l'appel. */
  appel: { saisi: boolean; presents: number; absents: number; sanctions: number; justifiees: number };
}

const JOURS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

function seanceTypeColor(label: string | null) {
  const t = (label ?? '').toUpperCase();
  if (t.startsWith('CM'))  return { bg: '#ede9fe', color: '#7c3aed' };
  if (t.startsWith('TD'))  return { bg: '#dbeafe', color: '#1d4ed8' };
  if (t.startsWith('TP'))  return { bg: '#dcfce7', color: '#15803d' };
  return { bg: '#f1f5f9', color: '#475569' };
}

/* « 19/10 » à partir de « 2026-10-19 ». */
function jourMois(iso: string | null | undefined): string {
  if (!iso) return '';
  const [, m, d] = iso.split('-');
  return d && m ? `${d}/${m}` : '';
}

export default function SalleSaisirPage() {
  const user  = getStoredUser();
  const annee = user?.annee_universitaire ?? '';
  const ts    = user?.semestre === 'Pairs' ? 'P' : 'I';
  const aujourdhui = aujourdhuiIso();

  // Le dernier choix (classe, semaine, jour) : au retour d'un appel, on
  // retrouve la même journée au lieu de tout resélectionner (17/10/2026).
  const memoire = useMemo(() => lireChoix(), []);
  const [jourFilter, setJourFilter] = useState<string>(memoire.jour ?? '');
  const [semaine,    setSemaine]    = useState<string>(memoire.semaine ?? '');
  const [selDepId,   setSelDepId]   = useState<string>(memoire.dep ?? '');

  /* ─── Semaines générées, avec leurs dates ──
     Lues sous `abs_saisie` : `/suivi/suivies/semaines-generees/` exigeait
     `suivi_saisie`, que la scolarité de l'IPGEI n'a pas — elle ne voyait
     aucune semaine (17/10/2026). */
  const semainesQuery = useQuery({
    queryKey: ['absences', 'fiches-semaines', annee, ts] as const,
    queryFn:  () => apiFetch<{ semaines: number[]; courante: number | null;
                               dates?: Record<string, { debut: string; fin: string }> }>(
      `/api/v1/absences/presences/fiches-semaines/?annee_universitaire=${encodeURIComponent(annee)}&type_semestre=${ts}`,
    ),
    enabled: !!annee,
  });
  const semaines = useMemo(() => [...(semainesQuery.data?.semaines ?? [])].sort((a, b) => b - a),
                           [semainesQuery.data]);
  const semaineCourante = semainesQuery.data?.courante ?? null;
  const datesSemaines = semainesQuery.data?.dates ?? {};

  // La semaine en cours, sauf si l'on revient sur une autre encore proposée.
  useEffect(() => {
    if (!semaines.length) return;
    if (!semaine || !semaines.includes(Number(semaine))) {
      setSemaine(String(semaineCourante ?? semaines[0]));
    }
  }, [semaines, semaineCourante, semaine]);

  /* ─── Classes ── */
  const departementsQuery = useQuery({
    queryKey: ['departements', 'list', { annee_universitaire: annee, page_size: 200, exclude: ['HE', 'ST'] }] as const,
    queryFn:  async () => {
      const res = await apiFetch<{ results: Departement[] } | Departement[]>(
        `/api/v1/departements/?annee_universitaire=${annee}&page_size=200`,
      ).catch(() => ({ results: [] as Departement[] }));
      const list = Array.isArray(res) ? res : res.results;
      return list
        .filter(d => !['HE', 'ST'].includes(d.nom)
                  && !d.is_container
                  && !(d.nom || '').toLowerCase().includes('stage'))
        .sort((a, b) => deptLabel(a).localeCompare(deptLabel(b)));
    },
    enabled: !!annee,
  });
  const departements = useMemo(() => departementsQuery.data ?? [], [departementsQuery.data]);

  // Une classe mémorisée qui n'est plus proposée est oubliée ; une seule
  // classe proposée est choisie d'office.
  useEffect(() => {
    if (!departements.length) return;
    if (selDepId && !departements.some(d => String(d.id) === selDepId)) setSelDepId('');
    else if (!selDepId && departements.length === 1) setSelDepId(String(departements[0].id));
  }, [departements, selDepId]);

  const initLoading = semainesQuery.isLoading || departementsQuery.isLoading;

  /* ─── Les séances de la SEMAINE de la classe (tous les jours) ──
     Une requête : séances dédoublonnées, triées par jour puis créneau, TP des
     sous-groupes compris, chacune avec le bilan de son appel. */
  const seancesQuery = useQuery({
    queryKey: ['absences', 'fiches-seances', { annee, ts, semaine, selDepId }] as const,
    queryFn:  () => apiFetch<SeanceRow[]>(
      // type_semestre : un même n° de semaine existe en Impair ET Pair.
      `/api/v1/absences/presences/fiches-seances/?annee_universitaire=${encodeURIComponent(annee)}`
      + `&type_semestre=${ts}&numero_semaine=${semaine}&departement=${selDepId}`,
    ),
    enabled: !!annee && !!semaine && !!selDepId,
  });
  // Le premier chargement seulement : un rafraîchissement (retour d'un appel)
  // ne remplace pas la liste par un sablier.
  const loading = seancesQuery.isLoading;
  const firstError = seancesQuery.error ?? semainesQuery.error;
  const error = firstError
    ? (firstError instanceof Error ? firstError.message : 'Erreur de chargement.')
    : null;

  const deLaSemaine = useMemo(() => seancesQuery.data ?? [], [seancesQuery.data]);
  const parJour = useMemo(() => bilanParJour(deLaSemaine), [deLaSemaine]);

  // Le jour proposé : le choisi s'il a cours, sinon aujourd'hui, sinon le
  // premier jour qui a cours — jamais une journée vide.
  useEffect(() => {
    if (!seancesQuery.data) return;
    const propose = jourAProposer(JOURS, parJour, jourFilter || null, aujourdhui);
    if (propose && propose !== jourFilter) setJourFilter(propose);
  }, [seancesQuery.data, parJour, jourFilter, aujourdhui]);

  useEffect(() => {
    if (selDepId || semaine || jourFilter) garderChoix({ dep: selDepId, semaine, jour: jourFilter });
  }, [selDepId, semaine, jourFilter]);

  const seances = useMemo(() => deLaSemaine.filter(s => s.jour_label === jourFilter),
                          [deLaSemaine, jourFilter]);
  const bilanDuJour = parJour.get(jourFilter);

  const peutAfficher = semaine && selDepId;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3 shadow-sm">
        <Link href="/dashboard/absences/saisir"
          className="p-2 rounded-xl text-gray-500 hover:bg-gray-100 transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <div className="w-8 h-8 rounded-xl flex items-center justify-center"
          style={{ background: 'linear-gradient(135deg, #C82020, #E03535)' }}>
          <Smartphone size={16} className="text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-gray-900">Mode Salle</p>
          <p className="text-xs text-gray-500 truncate">{annee || '—'}</p>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Filtres */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-3">

          {initLoading ? (
            <div className="flex items-center gap-2 text-xs text-gray-400 py-2">
              <Loader2 size={12} className="animate-spin" /> Chargement…
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Classe */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                  Classe <span className="text-[#C82020]">*</span>
                </label>
                <select
                  value={selDepId}
                  onChange={e => setSelDepId(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm bg-gray-50 focus:outline-none focus:border-[#C82020]"
                >
                  <option value="">— Choisir une classe —</option>
                  {departements.map(d => (
                    <option key={d.id} value={d.id}>{deptLabel(d, departements)}</option>
                  ))}
                </select>
              </div>

              {/* Semaine, avec ses dates */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Semaine</label>
                <select value={semaine} onChange={e => setSemaine(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm bg-gray-50 focus:outline-none focus:border-[#C82020]">
                  {semaines.length === 0 && <option value="">Aucune semaine générée</option>}
                  {semaines.map(s => (
                    <option key={s} value={s}>
                      Semaine {s}
                      {datesSemaines[String(s)] ? ` · ${libelleDates(datesSemaines[String(s)])}` : ''}
                      {s === semaineCourante ? ' · en cours' : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Jour : sa date, et ses appels faits / à faire. Une journée sans
              cours ne s'ouvre pas. */}
          {peutAfficher && !loading && (
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Jour</label>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                {JOURS.map(j => {
                  const b = parJour.get(j);
                  const actif = jourFilter === j;
                  const toutFait = !!b && b.faits === b.seances;
                  const estAujourdhui = b?.date === aujourdhui;
                  return (
                    <button key={j} onClick={() => b && setJourFilter(j)} disabled={!b}
                      className={`rounded-xl px-2 py-1.5 text-left transition-colors ${
                        actif ? 'text-white' : b ? 'border border-gray-200 hover:bg-gray-50' : 'border border-dashed border-gray-200 opacity-40 cursor-not-allowed'
                      }`}
                      style={actif ? { background: '#C82020' } : {}}
                      title={b ? `${b.seances} séance(s), ${b.faits} appel(s) fait(s)` : 'Aucune séance'}>
                      <span className="block text-xs font-bold">
                        {j} {jourMois(b?.date)}
                        {estAujourdhui && <span className={actif ? '' : 'text-[#C82020]'}> •</span>}
                      </span>
                      <span className={`block text-[10px] ${actif ? 'text-white/90' : toutFait ? 'text-[#006633]' : 'text-gray-500'}`}>
                        {b ? (toutFait ? '✓ appels faits' : `${b.faits}/${b.seances} appel${b.seances > 1 ? 's' : ''}`) : '—'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Erreur */}
        {error && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">
            <AlertCircle size={16} /> {error}
          </div>
        )}

        {/* Invite si classe non sélectionnée */}
        {!selDepId && !initLoading && (
          <div className="bg-white rounded-2xl p-8 text-center shadow-sm border border-gray-100">
            <BookOpen size={28} className="mx-auto mb-2 text-gray-200" />
            <p className="text-sm text-gray-400">Sélectionnez une classe pour voir les séances.</p>
          </div>
        )}

        {/* Liste des séances */}
        {peutAfficher && (
          loading ? (
            <div className="flex flex-col items-center gap-3 py-12">
              <Loader2 size={28} className="animate-spin text-gray-300" />
              <p className="text-sm text-gray-400">Chargement des séances…</p>
            </div>
          ) : seances.length === 0 ? (
            <div className="bg-white rounded-2xl p-10 text-center shadow-sm border border-gray-100">
              <Clock size={32} className="mx-auto mb-3 text-gray-200" />
              <p className="text-sm font-semibold text-gray-600">Aucune séance cette semaine</p>
              <p className="text-xs text-gray-400 mt-1">Choisissez une autre semaine ou une autre classe.</p>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  {jourFilter} {jourMois(bilanDuJour?.date)} — {seances.length} séance{seances.length > 1 ? 's' : ''}
                </p>
                {bilanDuJour && (
                  <p className={`text-xs font-semibold ${bilanDuJour.faits === bilanDuJour.seances ? 'text-[#006633]' : 'text-gray-500'}`}>
                    {bilanDuJour.faits === bilanDuJour.seances
                      ? <span className="inline-flex items-center gap-1"><CheckCircle size={12} /> Tous les appels sont faits</span>
                      : `${bilanDuJour.seances - bilanDuJour.faits} appel${bilanDuJour.seances - bilanDuJour.faits > 1 ? 's' : ''} à faire`}
                  </p>
                )}
              </div>
              {seances.map(s => {
                const label = s.type_seance_label || '?';
                const { bg, color } = seanceTypeColor(label);
                const creneau = s.creneau_label || null;
                const fait = s.appel.saisi;
                // À venir : signalé, mais ouvrable — une absence se saisit
                // parfois d'avance (absence annoncée).
                const aVenir = !!s.date_suivie && s.date_suivie > aujourdhui;

                return (
                  <Link key={s.id} href={`/dashboard/absences/saisir/salle/${s.id}`}
                    className={`block bg-white rounded-2xl p-4 shadow-sm border hover:shadow-md transition-all active:scale-[0.99] ${
                      fait ? 'border-green-100' : 'border-gray-100 hover:border-gray-200'}`}>
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 font-bold text-xs"
                        style={{ background: bg, color }}>
                        {label}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-gray-900 truncate">
                          {s.em_intitule || label}
                          {/* Un TP n'appelle que son sous-groupe : on le dit. */}
                          {s.sous_groupe && s.groupe && (
                            <span className="ml-1.5 px-1.5 rounded bg-green-50 text-green-800 text-[10px] font-semibold align-middle">
                              {s.groupe}
                            </span>
                          )}
                        </p>
                        <div className="mt-1 flex flex-wrap gap-2">
                          {creneau && (
                            <span className="flex items-center gap-1 text-xs font-semibold text-gray-700">
                              <Clock size={10} /> {creneau}
                            </span>
                          )}
                          {s.prof_nom && (
                            <span className="flex items-center gap-1 text-xs text-gray-500">
                              <User size={10} /> {s.prof_nom}
                            </span>
                          )}
                          {s.salle_nom && (
                            <span className="flex items-center gap-1 text-xs text-gray-500">
                              <MapPin size={10} /> {s.salle_nom}
                            </span>
                          )}
                        </div>
                      </div>
                      {/* L'appel : fait (et son bilan), ou à faire. */}
                      <div className="shrink-0 self-center text-right">
                        {fait ? (
                          <>
                            <p className="text-[11px] font-bold text-[#006633]">✓ Appel fait</p>
                            <p className="text-[11px]"
                              style={{ color: s.appel.absents ? '#C82020' : '#6b7280' }}>
                              {libelleBilan(s.appel)}
                            </p>
                          </>
                        ) : (
                          <>
                            <span className="inline-block text-[11px] font-bold text-white px-2.5 py-1 rounded-lg"
                              style={{ background: '#C82020' }}>
                              Appel à faire
                            </span>
                            {aVenir && <p className="text-[10px] text-gray-400 mt-0.5">à venir</p>}
                          </>
                        )}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )
        )}
      </div>
    </div>
  );
}
