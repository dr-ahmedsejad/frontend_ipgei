'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Download, Eye, Loader2, UserCheck } from 'lucide-react';

import { BTN_SECONDAIRE, CARTE, EnTetePage, Erreur, SELECT, VERT } from '../../_ui';
import { useAnneeIPGEI } from '../../_annee';
import { apiFetchBlob } from '@/lib/api';
import {
  surveillanceApi, type CaseSurveillance, type GroupeSurveillance,
} from '@/lib/api/surveillance';

/**
 * La vue de surveillance — « à cette heure-ci, où doit être chaque groupe,
 * et avec qui ? ».
 *
 * Les autres écrans répondent pour une classe, un enseignant ou une salle.
 * Celui qui veille sur les étudiants a besoin de TOUS les groupes en même
 * temps, sur UNE journée : lignes = les classes rangées par niveau, chacune
 * suivie de ses sous-groupes de TP ; colonnes = créneaux. Dans la case, la
 * salle d'abord — c'est là qu'on va vérifier —, puis la matière et
 * l'enseignant. Ce qui trompe la surveillance est marqué : épreuve (rouge),
 * épreuve sans surveillant, séance annulée, classes réunies ou en parallèle,
 * classe éclatée en sous-groupes. Le créneau en cours est surligné.
 *
 * Source : l'emploi du temps vivant et les épreuves (apps/ipgei/surveillance.py).
 * La case ouvre la saisie des absences de SA ligne de suivi, qui ramène ici,
 * sur la même journée — seulement là où elle s'ouvrira (`pointable`, calculé
 * au serveur avec les règles de l'écran de saisie). Module RBAC
 * « surveillance » : DA et AA par défaut.
 */

const CASE = 'border border-gray-200 align-top';
const ROUGE = '#C82020';

/** « 08h00-09h30 » → [480, 570] minutes. */
function bornes(libelle: string): [number, number] | null {
  const m = libelle.match(/(\d{1,2})\s*[h:]\s*(\d{2})?\D+(\d{1,2})\s*[h:]\s*(\d{2})?/);
  if (!m) return null;
  return [Number(m[1]) * 60 + Number(m[2] ?? 0), Number(m[3]) * 60 + Number(m[4] ?? 0)];
}

function isoLocal(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function decaler(iso: string, jours: number) {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + jours);
  return isoLocal(d);
}

const DATE_LONGUE = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
});

/** La saisie des absences d'une séance, avec retour sur cette journée. */
function lienAbsences(suivi: number, date: string) {
  const retour = `/dashboard/ipgei/edt/surveillance?date=${date}`;
  return `/dashboard/absences/saisir/salle/${suivi}?retour=${encodeURIComponent(retour)}`;
}

function Marque({ children, ton }: { children: React.ReactNode; ton: 'vert' | 'ambre' | 'rouge' | 'gris' }) {
  const classes = {
    vert:  'bg-green-50 text-[#006633]',
    ambre: 'bg-amber-50 text-amber-700',
    rouge: 'text-white',
    gris:  'bg-gray-100 text-gray-600',
  }[ton];
  return (
    <span className={`self-start px-1.5 rounded text-[10px] font-bold ${classes}`}
          style={ton === 'rouge' ? { background: ROUGE } : undefined}>
      {children}
    </span>
  );
}

function Case({ c, lien, motif }: { c?: CaseSurveillance; lien: string | null; motif: string }) {
  if (!c) {
    return <div className="h-full min-h-[84px] flex items-center justify-center text-xs text-gray-400">libre</div>;
  }

  if (c.dedouble) {
    return (
      <div className="h-full min-h-[84px] p-1.5 flex flex-col gap-0.5" style={{ borderLeft: '3px solid #d97706' }}>
        <div className="text-xs font-semibold text-amber-700">TP en sous-groupes</div>
        {c.sous_groupes.map(sg => (
          <div key={sg.groupe} className="text-[11px] leading-tight">
            <span className="font-semibold">{sg.groupe}</span> : <span className="font-extrabold">{sg.salle || '—'}</span>
            {sg.em_code && <span className="text-gray-500"> · {sg.em_code}</span>}
          </div>
        ))}
      </div>
    );
  }

  if (c.annulee) {
    return (
      <div className="h-full min-h-[84px] p-1.5 flex flex-col gap-0.5 bg-gray-50" style={{ borderLeft: '3px solid #9ca3af' }}>
        <div className="text-xs font-semibold text-gray-400 line-through" title={c.em_intitule}>
          {c.special ? c.type : `${c.type} ${c.em_code}`}
        </div>
        <Marque ton="gris">Annulée — groupe libre</Marque>
        {c.herite && <Marque ton="gris">Avec la classe</Marque>}
      </div>
    );
  }

  const contenu = (
    <div className={'h-full min-h-[84px] p-1.5 flex flex-col gap-0.5' + (c.herite ? ' opacity-80' : '')}
         style={{ background: c.evaluation ? 'rgba(200,32,32,0.08)' : 'transparent',
                  borderLeft: `3px ${c.herite ? 'dashed' : 'solid'} ${c.evaluation ? ROUGE : VERT}` }}>
      <div className={'text-base font-extrabold leading-tight ' + (c.evaluation ? 'text-red-700' : 'text-iss-dark')}>
        {c.salle || '—'}
      </div>
      <div className={'text-xs font-semibold ' + (c.evaluation ? 'text-red-700' : '')} title={c.em_intitule}>
        {c.special ? c.type : `${c.type} ${c.em_code}`}
      </div>
      {c.horaire && <div className="text-[11px] text-red-700">{c.horaire}</div>}
      {c.prof
        ? <div className="text-[11px] text-gray-600 truncate" title={c.prof}>{c.prof}</div>
        : c.evaluation && <div className="text-[11px] font-semibold text-red-700">Aucun surveillant désigné</div>}
      {c.evaluation && <Marque ton="rouge">ÉPREUVE</Marque>}
      {c.herite && <Marque ton="gris">Avec la classe</Marque>}
      {c.reunis.length > 0 && <Marque ton="vert">Réuni avec {c.reunis.join(', ')}</Marque>}
      {c.paralleles.length > 0 && (
        <Marque ton="ambre">
          En parallèle : {c.paralleles.map(p => (p.salle ? `${p.groupe} (${p.salle})` : p.groupe)).join(', ')}
        </Marque>
      )}
      {c.sous_groupes.length > 0 && (
        <Marque ton="ambre">
          Aussi : {c.sous_groupes.map(s => (s.salle ? `${s.groupe} (${s.salle})` : s.groupe)).join(', ')}
        </Marque>
      )}
      {c.doublon && (
        <span title="Deux séances sont posées sur cette case : seule la première est montrée.">
          <Marque ton="ambre">Deux séances sur ce créneau</Marque>
        </span>
      )}
      {lien && (
        <div className="mt-auto pt-0.5 text-[11px] text-[#006633] font-semibold inline-flex items-center gap-1">
          <UserCheck size={11} /> Absences
        </div>
      )}
      {!lien && motif && <div className="mt-auto pt-0.5 text-[10px] text-gray-400">{motif}</div>}
    </div>
  );
  return lien
    ? <Link href={lien} title="Marquer les absences de cette séance" className="block h-full hover:opacity-80">{contenu}</Link>
    : contenu;
}

function BoutonPdf({ libelle, params, fichier }: {
  libelle: string; params: Record<string, string>; fichier: string;
}) {
  const [erreur, setErreur] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: () => apiFetchBlob(surveillanceApi.pdfChemin, params),
    onSuccess: (blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fichier;
      a.click();
      URL.revokeObjectURL(url);
    },
    onError: (e) => {
      const message = e instanceof Error ? e.message : 'Erreur inconnue';
      // Le navigateur lâche parfois la lecture du corps alors que les octets
      // sont déjà arrivés : le fichier se télécharge quand même.
      if (message === 'Failed to fetch') return;
      setErreur(message);
      setTimeout(() => setErreur(null), 5000);
    },
  });
  return (
    <button onClick={() => mutation.mutate()} disabled={mutation.isPending}
            className={BTN_SECONDAIRE} title={erreur ?? undefined}>
      {mutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
      {erreur ? 'PDF indisponible' : libelle}
    </button>
  );
}

export default function VueSurveillancePage() {
  const { annee, setAnnee, options } = useAnneeIPGEI();
  const [date, setDate] = useState(() => isoLocal(new Date()));
  const [niveau, setNiveau] = useState('');
  const [avecSousGroupes, setAvecSousGroupes] = useState(true);
  const [maintenant, setMaintenant] = useState(() => new Date());

  // Retour de la saisie des absences : on revient sur la journée qu'on regardait.
  useEffect(() => {
    const d = new URLSearchParams(window.location.search).get('date');
    if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) setDate(d);
  }, []);

  // L'heure avance : le créneau surligné aussi, sans recharger.
  useEffect(() => {
    const t = setInterval(() => setMaintenant(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const { data: j, isLoading, error } = useQuery({
    queryKey: ['ipgei', 'surveillance', annee, date] as const,
    queryFn: () => surveillanceApi.journee(annee, date),
    enabled: !!annee,
    refetchInterval: 5 * 60_000,
  });

  const niveaux = useMemo(() => [...new Set((j?.groupes ?? []).map(g => g.niveau))], [j]);
  const libelleNiveau = (n: string) =>
    j?.groupes.find(g => g.niveau === n)?.niveau_libelle || n || 'Sans niveau';
  const groupes = (j?.groupes ?? []).filter(g =>
    (!niveau || g.niveau === niveau) && (avecSousGroupes || !g.sous_groupe));

  const aujourdhui = date === isoLocal(new Date());
  const minutes = maintenant.getHours() * 60 + maintenant.getMinutes();
  const creneauEnCours = aujourdhui
    ? j?.creneaux.find(c => { const b = bornes(c.libelle); return b && minutes >= b[0] && minutes <= b[1]; })?.id
    : undefined;
  // Une séance à venir ne prend pas d'absences : ni un autre jour (le serveur
  // le dit), ni aujourd'hui avant l'heure de son créneau.
  const commence = (libelle: string) => {
    if (!aujourdhui) return true;
    const b = bornes(libelle);
    return !b || minutes >= b[0];
  };
  const lienDe = (c: CaseSurveillance | undefined, creneau: string) =>
    c && c.pointable && c.suivi && !j?.a_venir && commence(creneau) ? lienAbsences(c.suivi, date) : null;

  const ligneGroupe = (g: GroupeSurveillance) => (
    <tr key={g.id} className={g.sous_groupe ? 'bg-gray-50/40' : undefined}>
      <td className={CASE + ' px-3 py-2 align-middle ' + (g.sous_groupe ? 'pl-7 text-sm font-semibold text-iss-gray' : 'font-bold text-iss-dark')}>
        {g.sous_groupe ? <>↳ {g.libelle}<span className="block text-[10px] font-normal">sous-groupe de TP</span></> : g.libelle}
      </td>
      {j!.creneaux.map(c => {
        const k = j!.cases[`${g.id}:${c.id}`];
        return (
          <td key={c.id} className={CASE + (c.id === creneauEnCours ? ' bg-green-50/60' : '')}>
            <Case c={k} lien={lienDe(k, c.libelle)} motif={j!.a_venir ? '' : (k?.motif ?? '')} />
          </td>
        );
      })}
    </tr>
  );

  return (
    <div className="space-y-4">
      <EnTetePage
        icone={<Eye className="w-4 h-4 text-white" />}
        titre="Vue de surveillance"
        sousTitre="Où doit être chaque classe, à chaque créneau de la journée"
        actions={
          <>
            <button onClick={() => setDate(d => decaler(d, -1))} className={BTN_SECONDAIRE} title="Jour précédent">
              <ChevronLeft size={16} />
            </button>
            <input type="date" value={date} onChange={e => e.target.value && setDate(e.target.value)}
                   className={SELECT + ' w-auto'} aria-label="Journée" />
            <button onClick={() => setDate(d => decaler(d, 1))} className={BTN_SECONDAIRE} title="Jour suivant">
              <ChevronRight size={16} />
            </button>
            {!aujourdhui && (
              <button onClick={() => setDate(isoLocal(new Date()))} className={BTN_SECONDAIRE}>Aujourd&apos;hui</button>
            )}
            {options.length > 1 && (
              <select value={annee} onChange={e => setAnnee(e.target.value)} className={SELECT + ' w-auto'}
                      aria-label="Année universitaire">
                {options.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            )}
            <select value={niveau} onChange={e => setNiveau(e.target.value)} className={SELECT + ' w-auto'}
                    aria-label="Niveau">
              <option value="">Tous les niveaux</option>
              {niveaux.map(n => <option key={n} value={n}>{libelleNiveau(n)}</option>)}
            </select>
            <label className="flex items-center gap-1.5 text-sm text-iss-dark whitespace-nowrap">
              <input type="checkbox" checked={avecSousGroupes} onChange={e => setAvecSousGroupes(e.target.checked)} />
              Sous-groupes
            </label>
            {annee && (
              <BoutonPdf libelle="PDF journée" params={surveillanceApi.pdfJournee(annee, date)}
                         fichier={`surveillance_${date}.pdf`} />
            )}
            {annee && j?.numero_semaine && j.type_semestre && (
              <BoutonPdf libelle={`PDF semaine ${j.numero_semaine}`}
                         params={surveillanceApi.pdfSemaine(annee, j.type_semestre, j.numero_semaine)}
                         fichier={`surveillance_${annee}_semaine_${j.numero_semaine}.pdf`} />
            )}
          </>
        }
      />

      {error && <Erreur erreur={error} />}

      {isLoading || !j ? (
        !error && (
          <div className={CARTE + ' p-10 flex items-center justify-center gap-2 text-iss-gray'}>
            <Loader2 className="w-4 h-4 animate-spin" /> Chargement…
          </div>
        )
      ) : (
        <div className={CARTE + ' overflow-x-auto'}>
          <div className="px-4 pt-3 pb-2 flex items-center justify-between flex-wrap gap-2">
            <p className="font-semibold text-iss-dark capitalize">
              {DATE_LONGUE.format(new Date(date + 'T12:00:00'))}
              {j.numero_semaine && <span className="text-iss-gray font-normal"> · semaine {j.numero_semaine}</span>}
            </p>
            {j.type_semaine && j.type_semaine !== 'cours' && (
              <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 text-xs font-semibold">
                Journée sans cours ({j.type_semaine}) — aucune classe n&apos;est attendue
              </span>
            )}
            {!j.dans_le_calendrier && (
              <span className="px-2 py-0.5 rounded bg-gray-50 text-iss-gray border border-gray-200 text-xs font-semibold">
                Hors calendrier de l&apos;année {annee}
              </span>
            )}
          </div>
          <table className="w-full text-sm" style={{ tableLayout: 'fixed', minWidth: 900 }}>
            <thead>
              <tr className="bg-gray-50 text-xs uppercase tracking-wide text-iss-gray">
                <th className={CASE + ' px-3 py-2 text-left'} style={{ width: 150 }}>Classe</th>
                {j.creneaux.map(c => (
                  <th key={c.id}
                      className={CASE + ' px-2 py-2 text-center ' +
                        (c.id === creneauEnCours ? 'bg-[#006633] text-white' : c.inactif ? 'text-amber-700' : '')}>
                    {c.libelle}
                    {c.id === creneauEnCours
                      ? <span className="block text-[10px] normal-case">en cours</span>
                      : c.inactif && <span className="block text-[10px] normal-case">créneau inactif</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groupes.length === 0 && (
                <tr><td colSpan={j.creneaux.length + 1} className="p-8 text-center text-iss-gray">
                  Aucune classe planifiable en {annee}.
                </td></tr>
              )}
              {niveaux.filter(n => !niveau || n === niveau).map(n => (
                <Fragment key={n || 'sans'}>
                  <tr>
                    <td colSpan={j.creneaux.length + 1}
                        className="px-3 py-1.5 bg-gray-50 text-xs font-bold uppercase tracking-wide text-[#006633] border border-gray-200">
                      {libelleNiveau(n)}
                    </td>
                  </tr>
                  {groupes.filter(g => g.niveau === n).map(ligneGroupe)}
                </Fragment>
              ))}
            </tbody>
          </table>
          <p className="px-4 py-2 text-[11px] text-iss-gray border-t border-gray-100">
            Salle en gros : c&apos;est là qu&apos;on vérifie. Rouge : devoir ou examen. « Réuni » : même cours, même salle ;
            « En parallèle » : même cours, autre salle. « Avec la classe » : le sous-groupe suit le cours de sa classe.
            {j.droits_saisie && !j.a_venir && ' Cliquez une séance commencée pour marquer ses absences.'}
          </p>
        </div>
      )}
    </div>
  );
}
