'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  AlertTriangle, ArrowLeft, CheckCircle2, ChevronRight, Filter, HelpCircle, Layers, Loader2, Users,
} from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { getStoredUser } from '@/lib/auth';

/**
 * Avancement par GROUPE — ce que l'écran des matières ne peut pas montrer.
 *
 * Là-bas, chaque matière affiche la progression du groupe LE PLUS AVANCÉ : un TP
 * dédoublé sur G1 et G2 fait avancer le programme d'une séance, pas de deux, et
 * la somme donnerait 200 %. Juste — mais le retard d'un groupe y devient
 * invisible : A a fait ses 10 h de TP, B seulement 4, la matière affiche 100 %.
 *
 * L'écran se lit en trois temps : on choisit un NIVEAU, ses CLASSES s'affichent
 * en cartes — celle qui décroche saute aux yeux —, et on ouvre celle qui
 * inquiète pour trouver ses SOUS-GROUPES. C'est là que le retard se loge : les
 * TP y sont dédoublés, et un demi-groupe peut avoir sauté une séance que l'autre
 * a eue.
 *
 * Un sous-groupe hérite des CM et TD de sa classe — ils sont dispensés à la
 * classe entière — et garde ses TP propres. Le serveur s'en charge.
 */

const VERT = '#006633';
const VERT_FONCE = '#005522';
const ROUGE = '#C82020';

interface Groupe {
  departement: number | null;
  nom:         string;
  niveau:      string;
  parent:      number | null;
  classe:      string;
  real_CM: number; real_TD: number; real_TP: number; real_PR: number;
  rate_CM: number; rate_TD: number; rate_TP: number; rate_PR: number;
  pct_CM:  number; pct_TD:  number; pct_TP:  number; pct_PR:  number;
  /** Heures ÉCOULÉES, faites ou non : ce qui aurait dû l'être à ce jour. */
  due_CM:  number; due_TD:  number; due_TP:  number; due_PR:  number;
  /** Écart au groupe le PLUS AVANCÉ — ce que les autres ont fait et pas lui. */
  ecart_CM: number; ecart_TD: number; ecart_TP: number; ecart_PR: number;
}

interface MatiereGroupes {
  em:       number;
  code_em:  string;
  intitule: string;
  semestre: string;
  plan_CM: number; plan_TD: number; plan_TP: number; plan_PR: number;
  /** Heures du groupe le plus avancé : la référence de l'écart. */
  programme_CM: number; programme_TD: number; programme_TP: number; programme_PR: number;
  programme_pct_CM: number; programme_pct_TD: number;
  programme_pct_TP: number; programme_pct_PR: number;
  groupes:  Groupe[];
}

interface SeanceRatee {
  numero_semaine: number; date: string | null; jour: string;
  creneau: string; type_seance: string; prof: string; duree: number;
  /** La date est-elle passée ? Une séance à venir se replanifie encore. */
  passee: boolean;
}

interface Semestre {
  id: number; semestre: string; code_semestre: string; type_semestre: string;
  /** « MPSI » ou « MP » : un semestre appartient à une année d'étude. */
  niveau_nom?: string;
}

interface ClasseSelect { id: number; nom: string; niveau: string; }

type Famille = 'CM' | 'TD' | 'TP' | 'PR';
const FAMILLES: Famille[] = ['CM', 'TD', 'TP', 'PR'];

/**
 * Le vert dit « à jour », le rouge « en retard ». Pas de dégradé : un taux de
 * 80 % appelle la même action qu'un taux de 20 %, on rattrape.
 */
function styleTaux(pct: number, plan: number): React.CSSProperties {
  if (plan === 0) return { color: '#94a3b8' };
  if (pct >= 100) return { background: 'rgba(0,102,51,0.13)', color: VERT, fontWeight: 700 };
  return { background: 'rgba(200,32,32,0.13)', color: ROUGE, fontWeight: 700 };
}

function fmtH(v: number): string {
  return v > 0 ? v.toFixed(1) : '—';
}

export default function AvancementGroupesPage() {
  const user  = getStoredUser();
  const annee = user?.annee_universitaire ?? '';
  const ts    = user?.semestre === 'Pairs' ? 'P' : 'I';

  const [niveau,     setNiveau]     = useState('');
  const [semestreId, setSemestreId] = useState('');
  const [classe,     setClasse]     = useState<string | null>(null);
  const [detail,     setDetail]     = useState<{ em: MatiereGroupes; groupe: Groupe } | null>(null);

  const semestresQuery = useQuery({
    queryKey: ['parametres', 'semestres', 'all', { type: ts }] as const,
    queryFn:  async () => {
      const sems = await apiFetch<Semestre[]>('/api/v1/parametres/semestres/all/')
        .catch(() => [] as Semestre[]);
      return (Array.isArray(sems) ? sems : []).filter(s => s.type_semestre === ts);
    },
  });
  // Un semestre appartient à un niveau : S1 et S2 sont de MPSI, S3 et S4 de MP.
  // Proposer S3 sous MPSI ferait choisir une période que ses groupes ne suivent
  // pas, et le tableau reviendrait vide sans dire pourquoi.
  const semestres = (semestresQuery.data ?? [])
    .filter(s => !niveau || !s.niveau_nom || s.niveau_nom === niveau);

  // Le semestre SE DÉDUIT : un niveau et une parité n'en désignent qu'un seul —
  // MPSI en période impaire, c'est S1 ; MP, c'est S3. Le faire choisir était un
  // choix sans alternative, et une occasion de se tromper.
  useEffect(() => {
    if (!niveau) { setSemestreId(''); return; }
    if (semestres.length === 1) {
      setSemestreId(String(semestres[0].id));
    } else if (semestreId && !semestres.some(s => String(s.id) === semestreId)) {
      // Le semestre retenu appartenait à l'autre niveau : on ne le garde pas.
      setSemestreId('');
    }
    // `semestres` est recalculé à chaque rendu : on suit sa longueur et le
    // niveau, qui sont ce qui change réellement.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [niveau, semestres.length]);

  // Les niveaux réellement ouverts cette année — pas une liste figée : une année
  // sans deuxième promotion ne doit pas proposer MP.
  const niveauxQuery = useQuery({
    queryKey: ['ipgei', 'classes', 'select', annee] as const,
    queryFn:  async () => {
      const cls = await apiFetch<ClasseSelect[]>(
        `/api/v1/ipgei/classes/select/?annee_universitaire=${annee}&actif=true`,
      ).catch(() => [] as ClasseSelect[]);
      return [...new Set((cls ?? []).map(c => c.niveau))].sort();
    },
    enabled: !!annee,
  });
  const niveaux = niveauxQuery.data ?? [];

  function params(): URLSearchParams {
    const p = new URLSearchParams({ annee_universitaire: annee, type_semestre: ts });
    if (semestreId) p.set('semestre_id', semestreId);
    if (niveau)     p.set('niveau', niveau);
    return p;
  }

  const chargerMut = useMutation({
    mutationFn: () => apiFetch<MatiereGroupes[]>(`/api/v1/avancement/groupes/?${params()}`),
  });
  const matieres = chargerMut.data ?? null;
  const erreur = chargerMut.error
    ? (chargerMut.error instanceof Error ? chargerMut.error.message : 'Erreur')
    : null;

  // Les séances manquées ne se chargent qu'à la demande : il y a autant de cases
  // que de matières × groupes, les charger toutes serait un gaspillage.
  const rateesQuery = useQuery({
    queryKey: ['avancement', 'seances-ratees', detail?.em.em, detail?.groupe.departement] as const,
    queryFn:  () => {
      const p = params();
      p.set('em', String(detail!.em.em));
      if (detail!.groupe.departement) p.set('departement', String(detail!.groupe.departement));
      return apiFetch<SeanceRatee[]>(`/api/v1/avancement/groupes/seances-ratees/?${p}`);
    },
    enabled: !!detail,
  });

  /** Les lignes d'un groupe : une par matière qui le concerne. */
  function lignes(nomGroupe: string) {
    return (matieres ?? [])
      .map(m => ({ matiere: m, groupe: m.groupes.find(g => g.nom === nomGroupe) }))
      .filter((l): l is { matiere: MatiereGroupes; groupe: Groupe } => !!l.groupe);
  }

  /**
   * Achevés, attendus, heures dues — et surtout `heuresEcoulees`, sans quoi on
   * ne peut RIEN conclure.
   *
   * Zéro heure due, c'est aussi ce que rend une base où le suivi n'a jamais été
   * généré. Annoncer « à jour » dans ce cas serait un mensonge : on ne sait
   * rien. Tant qu'aucune séance n'est écoulée, la carte le dit.
   */
  function bilan(noms: string[]) {
    let heuresFaites = 0, ecart = 0;
    // Le nombre de MATIÈRES concernées, et non de couples (matière × type) :
    // « 2 matières en écart » se comprend et se traite ; « achevés 0/16 »
    // comptait des volumes annuels et serait resté à zéro jusqu'en juin.
    const enEcart = new Set<string>();
    const suivies = new Set<string>();
    for (const nom of noms) {
      for (const { matiere, groupe } of lignes(nom)) {
        suivies.add(matiere.code_em);
        for (const f of FAMILLES) {
          // L'ÉCART se compte sur TOUTES les familles, y compris celles que la
          // maquette ne chiffre pas : un DS tenu par les autres groupes et pas
          // par celui-ci est une séance manquée, même si la maquette ne déclare
          // aucun volume de TD. C'est la règle du tableau, et les deux totaux
          // doivent dire la même chose.
          ecart += groupe[`ecart_${f}`];
          heuresFaites += groupe[`real_${f}`];
          if (groupe[`ecart_${f}`] > 0) enEcart.add(matiere.code_em);
        }
      }
    }
    // Une séance pointée « faite » AVANT sa date compte : elle est faite. Ne
    // regarder que les séances écoulées laissait une classe en avance passer
    // pour non renseignée, alors que son enseignant avait pointé.
    return { heuresFaites, ecart, enEcart: enEcart.size, suivies: suivies.size };
  }

  // Les classes, et sous chacune ses groupes.
  const parClasse = new Map<string, Groupe[]>();
  for (const m of matieres ?? []) {
    for (const g of m.groupes) {
      const liste = parClasse.get(g.classe) ?? [];
      if (!liste.some(x => x.nom === g.nom)) liste.push(g);
      parClasse.set(g.classe, liste);
    }
  }
  const classes = [...parClasse.keys()].sort();

  // Les heures faites par le niveau entier : sans elles, aucun groupe n'a de
  // référence, et un écart de zéro ne voudrait pas dire « au niveau des autres »
  // mais « personne n'a rien fait ».
  const totalFaites = (matieres ?? []).reduce(
    (total, m) => total + FAMILLES.reduce((t, f) => t + m[`programme_${f}`], 0), 0);

  /** Les groupes d'une classe : ses sous-groupes de TP, ou elle-même à défaut. */
  function groupesDeLaClasse(nomClasse: string): Groupe[] {
    const tous = parClasse.get(nomClasse) ?? [];
    const sousGroupes = tous.filter(g => g.parent !== null);
    return (sousGroupes.length ? sousGroupes : tous)
      .slice()
      .sort((a, b) => a.nom.localeCompare(b.nom));
  }

  const semLabel = semestreId
    ? (semestres.find(s => String(s.id) === semestreId)?.semestre ?? '')
    : (ts === 'P' ? 'Tous les semestres pairs' : 'Tous les semestres impairs');

  return (
    <div className="space-y-5">
      <Link href="/dashboard/avancement/em"
            className="inline-flex items-center gap-1.5 text-sm text-iss-gray hover:text-[#006633] transition-colors">
        <ArrowLeft size={14} /> Avancement par matière
      </Link>

      <div className="flex items-center gap-2">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl" style={{ background: VERT }}>
          <Layers size={16} className="text-white" />
        </span>
        <div>
          <h1 className="text-lg font-semibold text-iss-dark">Avancement par groupe</h1>
          <p className="text-xs text-iss-gray">
            Chaque groupe compté pour lui-même — l&apos;écran des matières, lui, retient
            le groupe le plus avancé.
          </p>
        </div>
      </div>

      {/* Filtres */}
      <div className="bg-white rounded-2xl p-4 shadow-card border border-gray-100 flex flex-wrap items-end gap-4">
        <div>
          <label className="block text-xs font-semibold text-iss-dark mb-1.5">
            Niveau <span className="text-red-600">*</span>
          </label>
          <select value={niveau}
                  onChange={e => { setNiveau(e.target.value); setSemestreId('');
                                   setClasse(null); setDetail(null); }}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm min-w-[10rem]">
            <option value="">— Choisir —</option>
            {niveaux.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-iss-dark mb-1.5">Semestre</label>
          {semestres.length === 1 ? (
            /* Déduit : on l'affiche pour que l'agent sache sur quoi il travaille,
               sans lui demander de le confirmer. */
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm min-w-[6rem]">
              <span className="text-iss-dark font-medium">{semestres[0].code_semestre}</span>
            </div>
          ) : (
            <select value={semestreId} onChange={e => setSemestreId(e.target.value)}
                    disabled={!niveau}
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm min-w-[14rem] disabled:bg-gray-50">
              <option value="">
                {niveau
                  ? (ts === 'P' ? 'Tous les semestres pairs' : 'Tous les semestres impairs')
                  : 'Choisissez d’abord un niveau'}
              </option>
              {semestres.map(s => <option key={s.id} value={s.id}>{s.semestre}</option>)}
            </select>
          )}
        </div>
        <button onClick={() => { setClasse(null); setDetail(null); chargerMut.mutate(); }}
                disabled={!annee || !niveau || chargerMut.isPending}
                className="inline-flex items-center gap-1.5 rounded-lg px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
                style={{ background: VERT }}>
          {chargerMut.isPending
            ? <><Loader2 size={14} className="animate-spin" /> Chargement…</>
            : <><Filter size={14} /> Afficher</>}
        </button>
      </div>

      {erreur && <p className="text-sm text-iss-secondary bg-red-50 rounded-xl p-4">{erreur}</p>}

      {/* Les classes en cartes : celle qui décroche saute aux yeux. */}
      {classes.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {classes.map(nom => {
            const groupes = groupesDeLaClasse(nom);
            const { heuresFaites, ecart, enEcart, suivies } = bilan(groupes.map(g => g.nom));
            // « Renseigné » se juge sur l'ensemble du niveau : si personne n'a
            // rien pointé, il n'y a pas de référence, donc pas d'écart à lire.
            const renseigne = heuresFaites > 0 || totalFaites > 0;
            const enRetard = ecart > 0;
            const ouverte = classe === nom;
            const couleur = !renseigne ? '#64748b' : (enRetard ? ROUGE : VERT);
            return (
              <button key={nom} onClick={() => { setClasse(ouverte ? null : nom); setDetail(null); }}
                      className="text-left bg-white rounded-2xl p-4 shadow-card border transition-colors"
                      style={{ borderColor: ouverte ? VERT
                                 : (renseigne && enRetard ? 'rgba(200,32,32,0.35)' : '#f1f5f9') }}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold text-iss-dark">{nom}</span>
                  {!renseigne
                    ? <HelpCircle size={15} style={{ color: '#64748b' }} />
                    : enRetard
                      ? <AlertTriangle size={15} style={{ color: ROUGE }} />
                      : <CheckCircle2 size={15} style={{ color: VERT }} />}
                </div>
                <p className="text-2xl font-bold tabular-nums" style={{ color: couleur }}>
                  {!renseigne ? 'Non renseigné'
                    : enRetard ? `− ${ecart.toFixed(1)} h`
                    : 'Au niveau'}
                </p>
                <p className="text-xs text-iss-gray mt-0.5">
                  {!renseigne
                    ? 'aucune séance pointée à ce niveau'
                    : enRetard
                      ? 'de moins que les autres groupes'
                      : 'rien que les autres aient fait en plus'}
                </p>
                <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-iss-gray">
                  <span>
                    {enEcart > 0
                      ? <><strong className="tabular-nums" style={{ color: ROUGE }}>{enEcart}</strong>
                          {' '}matière{enEcart > 1 ? 's' : ''} en écart sur {suivies}</>
                      : <><strong className="text-iss-dark tabular-nums">{suivies}</strong> matières suivies</>}
                    <span className="mx-1.5">·</span>
                    {groupes.length} groupe{groupes.length > 1 ? 's' : ''}
                  </span>
                  <span className="inline-flex items-center gap-0.5" style={{ color: VERT }}>
                    {ouverte ? 'Fermer' : 'Ouvrir'}
                    <ChevronRight size={13} style={{ transform: ouverte ? 'rotate(90deg)' : undefined }} />
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {matieres && classes.length === 0 && (
        <p className="bg-white rounded-2xl p-6 shadow-card border border-gray-100 text-sm text-iss-gray">
          Aucune classe de niveau {niveau || '—'} en {annee}.
        </p>
      )}

      {/* La classe ouverte : un tableau par sous-groupe. */}
      {classe && groupesDeLaClasse(classe).map(groupe => (
        <div key={groupe.nom} className="bg-white rounded-2xl shadow-card border border-gray-100 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <Users size={15} style={{ color: VERT }} />
              <span className="text-sm font-semibold text-iss-dark">{groupe.nom}</span>
              <span className="text-xs text-iss-gray">— {semLabel}</span>
            </div>
            {groupe.parent !== null && (
              <span className="text-xs text-iss-gray">CM et TD suivis avec {groupe.classe}</span>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="text-white" style={{ background: VERT }}>
                  <th rowSpan={2} className="px-3 py-2.5 text-left font-semibold whitespace-nowrap"
                      style={{ border: `1px solid ${VERT_FONCE}` }}>Code matière</th>
                  <th rowSpan={2} className="px-3 py-2.5 text-left font-semibold"
                      style={{ border: `1px solid ${VERT_FONCE}` }}>Intitulé</th>
                  <th colSpan={4} className="px-3 py-2 text-center font-semibold"
                      style={{ border: `1px solid ${VERT_FONCE}` }}>Planification</th>
                  <th colSpan={4} className="px-3 py-2 text-center font-semibold"
                      style={{ border: `1px solid ${VERT_FONCE}` }}>Réalisation</th>
                  <th colSpan={4} className="px-3 py-2 text-center font-semibold"
                      style={{ border: `1px solid ${VERT_FONCE}` }}>% Avancement</th>
                  <th rowSpan={2} className="px-3 py-2.5 text-center font-semibold whitespace-nowrap"
                      style={{ border: `1px solid ${VERT_FONCE}` }}>Écart aux autres</th>
                </tr>
                <tr className="text-white" style={{ background: VERT_FONCE }}>
                  {[...FAMILLES, ...FAMILLES, ...FAMILLES].map((h, i) => (
                    <th key={i} className="px-2 py-2 text-center font-medium"
                        style={{ border: '1px solid #004411' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lignes(groupe.nom).map(({ matiere, groupe: g }) => {
                  const dues = FAMILLES.reduce((t, f) => t + g[`ecart_${f}`], 0);
                  return (
                    <tr key={matiere.em} className="border-b border-gray-50 hover:bg-gray-50/60">
                      <td className="px-3 py-2.5 whitespace-nowrap text-iss-gray">{matiere.code_em}</td>
                      <td className="px-3 py-2.5 font-medium text-iss-dark">{matiere.intitule}</td>
                      {FAMILLES.map(f => (
                        <td key={`p${f}`} className="px-2 py-2.5 text-center tabular-nums text-iss-gray">
                          {matiere[`plan_${f}`] > 0 ? matiere[`plan_${f}`] : '—'}
                        </td>
                      ))}
                      {FAMILLES.map(f => (
                        <td key={`r${f}`} className="px-2 py-2.5 text-center tabular-nums">
                          {fmtH(g[`real_${f}`])}
                        </td>
                      ))}
                      {FAMILLES.map(f => (
                        <td key={`t${f}`} className="px-2 py-2.5 text-center tabular-nums"
                            style={styleTaux(g[`pct_${f}`], matiere[`plan_${f}`])}>
                          {matiere[`plan_${f}`] > 0 ? `${g[`pct_${f}`]} %` : '—'}
                        </td>
                      ))}
                      <td className="px-3 py-2.5 text-center tabular-nums">
                        {dues > 0 ? (
                          <button onClick={() => setDetail({ em: matiere, groupe: g })}
                                  className="font-semibold underline decoration-dotted"
                                  style={{ color: ROUGE }}
                                  title="Voir les séances que ce groupe n'a pas eues">
                            − {dues.toFixed(1)} h
                          </button>
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {/* Le détail : quelle séance, quel jour, avec quel enseignant. */}
      {detail && (
        <div className="bg-white rounded-2xl shadow-card border border-gray-100 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div>
              <div className="text-sm font-semibold text-iss-dark">
                {detail.em.intitule} — {detail.groupe.nom}
              </div>
              <div className="text-xs text-iss-gray">
                Séances que ce groupe n&apos;a pas eues — celles à rattraper d&apos;abord
              </div>
            </div>
            <button onClick={() => setDetail(null)}
                    className="text-sm text-iss-gray hover:text-iss-dark">Fermer</button>
          </div>
          {rateesQuery.isPending ? (
            <p className="px-5 py-6 text-sm text-iss-gray">Chargement…</p>
          ) : (rateesQuery.data ?? []).length === 0 ? (
            <p className="px-5 py-6 text-sm text-iss-gray">
              Aucune séance en attente pour ce groupe.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-gray-50 text-iss-gray">
                    {['Semaine', 'Date', 'Jour', 'Créneau', 'Type', 'Enseignant', 'Durée', 'Échéance'].map(h => (
                      <th key={h} className="px-3 py-2 text-left font-semibold uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(rateesQuery.data ?? []).map((s, i) => (
                    <tr key={i} className="border-t border-gray-50">
                      <td className="px-3 py-2 tabular-nums">S{s.numero_semaine}</td>
                      <td className="px-3 py-2 tabular-nums">{s.date ?? '—'}</td>
                      <td className="px-3 py-2">{s.jour || '—'}</td>
                      <td className="px-3 py-2">{s.creneau || '—'}</td>
                      <td className="px-3 py-2">{s.type_seance || '—'}</td>
                      <td className="px-3 py-2">{s.prof || '—'}</td>
                      <td className="px-3 py-2 tabular-nums">{s.duree} h</td>
                      {/* Une séance passée est perdue et se rattrape ; une séance
                          à venir se replanifie encore. Le geste n'est pas le même. */}
                      <td className="px-3 py-2">
                        <span className="rounded px-1.5 py-0.5 text-[11px] font-semibold"
                              style={s.passee
                                ? { background: 'rgba(200,32,32,0.13)', color: ROUGE }
                                : { background: 'rgba(0,102,51,0.10)', color: VERT }}>
                          {s.passee ? 'à rattraper' : 'à venir'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
