'use client';

/**
 * Grille hebdomadaire en LECTURE SEULE, partagée par les trois vues de
 * consultation (par classe, par enseignant, par salle).
 *
 * Même grille que la saisie — jours en lignes, créneaux en colonnes, en-tête
 * vert — mais sans autocomplétions : on consulte et on imprime. Ce qu'affiche
 * la carte varie selon l'axe : sur l'EDT d'un enseignant, sa propre identité
 * n'apporte rien, c'est la classe qui manque.
 */
import {
  AlertTriangle, CalendarClock, ChevronLeft, ChevronRight,
  FileText, Loader2,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';

import { apiFetchBlob } from '@/lib/api';

import { BTN_PRIMAIRE, CARTE, Chargement, DEGRADE, SELECT, Vide } from '../_ui';
import {
  BandeauEpreuve, CarteMatiere, decouperLigne, type LigneSeance,
  STYLE_CELLULE, STYLE_CELLULE_JOUR, STYLE_ENTETE_CRENEAU,
  STYLE_ENTETE_JOUR, STYLE_ENTETE_LIGNE, STYLE_TABLE, couleurType,
} from './_cellule';
import { useReferentielsEDT } from './_referentiels';
import {
  type EpreuveSurimpression, type SeanceAffichable, type SemaineIPGEI,
} from '@/types/ipgei';

/** Axe de lecture : détermine ce que la carte met en avant. */
export type AxeEDT = 'classe' | 'prof' | 'salle';

// ── Navigation par semaine, commune aux trois vues ───────────────────────────
/**
 * Style des flèches de défilement.
 *
 * Exporté pour que l'écran d'historique, qui fait défiler des semaines
 * archivées et non des semaines du calendrier, ait exactement les mêmes
 * boutons : deux sélecteurs qui se ressemblent à 90 % se lisent comme un
 * défaut d'alignement.
 */
export const BTN_FLECHE =
  'p-2.5 rounded-xl border border-gray-200 text-iss-gray hover:bg-gray-50 '
  + 'disabled:opacity-40 transition-colors';

/** « du 05 au 10 octobre » — la semaine se reconnaît à ses dates. */
export function libelleDatesSemaine(debut: string, fin: string): string {
  const jour = (d: string) => new Date(d).toLocaleDateString('fr-FR',
    { day: '2-digit', month: 'short' });
  return `du ${jour(debut)} au ${jour(fin)}`;
}

export function SelecteurSemaine({
  semaines, semaineId, onChange,
}: {
  semaines: SemaineIPGEI[];
  semaineId: number | null;
  onChange: (id: number | null) => void;
}) {
  const cours = useMemo(
    () => semaines.filter(s => s.type_semaine === 'cours'),
    [semaines],
  );

  // S'ouvre sur la semaine en cours plutôt que sur la première du semestre.
  useEffect(() => {
    if (cours.length === 0) { onChange(null); return; }
    if (semaineId && cours.some(s => s.id === semaineId)) return;
    const aujourdhui = new Date().toISOString().slice(0, 10);
    const courante = cours.find(s => s.date_debut <= aujourdhui && aujourdhui <= s.date_fin);
    onChange((courante ?? cours[0]).id);
  }, [cours, semaineId, onChange]);

  const index = cours.findIndex(s => s.id === semaineId);

  return (
    <div className="flex items-center gap-1">
      <button onClick={() => cours[index - 1] && onChange(cours[index - 1].id)}
              disabled={index <= 0} title="Semaine précédente"
              className={BTN_FLECHE}>
        <ChevronLeft size={14} />
      </button>
      <select value={semaineId ?? ''} className={SELECT} style={{ minWidth: 180 }}
              onChange={e => onChange(e.target.value ? Number(e.target.value) : null)}>
        <option value="">—</option>
        {cours.map(s => (
          <option key={s.id} value={s.id}>
            Semaine {s.numero} — {s.semestre_code} · {libelleDatesSemaine(s.date_debut, s.date_fin)}
          </option>
        ))}
      </select>
      <button onClick={() => cours[index + 1] && onChange(cours[index + 1].id)}
              disabled={index < 0 || index >= cours.length - 1} title="Semaine suivante"
              className={BTN_FLECHE}>
        <ChevronRight size={14} />
      </button>
    </div>
  );
}

/** Une entrée du sélecteur par DATE : les semaines de même dates réunies. */
export interface SemaineGroupee {
  /** Les identifiants des semaines couvertes, pour l'API : « 12,19 ». */
  cle:        string;
  numero:     number | null;
  date_debut: string;
  date_fin:   string;
  /** Les semestres réunis, dans l'ordre : S1, S3. */
  semestres:  string[];
}

/**
 * Les semaines de MÊMES DATES réunies en une seule entrée.
 *
 * Une semaine de calendrier existe une fois par semestre de la période — S1
 * pour les MPSI, S3 pour les MP. Un enseignant intervient dans les deux : la
 * liste lui montrait donc chaque semaine en double, aux mêmes dates et sans
 * rien pour les distinguer, et chaque entrée ne portait que la moitié de son
 * service. Ici une date vaut une entrée, et la grille réunit les deux.
 */
export function grouperSemainesParDate(semaines: SemaineIPGEI[]): SemaineGroupee[] {
  const par_date = new Map<string, SemaineGroupee>();
  for (const s of semaines.filter(x => x.type_semaine === 'cours')) {
    const existante = par_date.get(s.date_debut);
    if (existante) {
      existante.cle = `${existante.cle},${s.id}`;
      if (!existante.semestres.includes(s.semestre_code)) {
        existante.semestres.push(s.semestre_code);
        existante.semestres.sort();
      }
    } else {
      par_date.set(s.date_debut, {
        cle: String(s.id), numero: s.numero,
        date_debut: s.date_debut, date_fin: s.date_fin,
        semestres: [s.semestre_code],
      });
    }
  }
  return [...par_date.values()].sort((a, b) => a.date_debut.localeCompare(b.date_debut));
}

export function SelecteurSemaineParDate({
  semaines, valeur, onChange,
}: {
  semaines: SemaineIPGEI[];
  valeur: string | null;
  onChange: (cle: string | null) => void;
}) {
  const entrees = useMemo(() => grouperSemainesParDate(semaines), [semaines]);

  // S'ouvre sur la semaine en cours plutôt que sur la première du semestre.
  useEffect(() => {
    if (entrees.length === 0) { onChange(null); return; }
    if (valeur && entrees.some(e => e.cle === valeur)) return;
    const aujourdhui = new Date().toISOString().slice(0, 10);
    const courante = entrees.find(e => e.date_debut <= aujourdhui && aujourdhui <= e.date_fin);
    onChange((courante ?? entrees[0]).cle);
  }, [entrees, valeur, onChange]);

  const index = entrees.findIndex(e => e.cle === valeur);

  return (
    <div className="flex items-center gap-1">
      <button onClick={() => entrees[index - 1] && onChange(entrees[index - 1].cle)}
              disabled={index <= 0} title="Semaine précédente"
              className={BTN_FLECHE}>
        <ChevronLeft size={14} />
      </button>
      <select value={valeur ?? ''} className={SELECT} style={{ minWidth: 280 }}
              onChange={e => onChange(e.target.value || null)}>
        <option value="">—</option>
        {entrees.map(e => (
          <option key={e.cle} value={e.cle}>
            Semaine {e.numero} {libelleDatesSemaine(e.date_debut, e.date_fin)}
            {' '}· {e.semestres.join(' · ')}
          </option>
        ))}
      </select>
      <button onClick={() => entrees[index + 1] && onChange(entrees[index + 1].cle)}
              disabled={index < 0 || index >= entrees.length - 1} title="Semaine suivante"
              className={BTN_FLECHE}>
        <ChevronRight size={14} />
      </button>
    </div>
  );
}

/**
 * Téléchargement du PDF, généré par le serveur.
 *
 * Seule voie d'impression : le PDF porte l'en-tête de l'institution et la mise
 * en page paysage des emplois du temps, que l'impression navigateur ne sait pas
 * reproduire. Proposer les deux laissait choisir la mauvaise.
 */
export function BoutonPDF({ chemin, params, nomDefaut, actif = true }: {
  chemin: string;
  params: Record<string, string>;
  nomDefaut: string;
  actif?: boolean;
}) {
  const [erreur, setErreur] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => apiFetchBlob(chemin, params),
    onSuccess: (blob) => {
      const url = URL.createObjectURL(blob);
      const a   = document.createElement('a');
      a.href     = url;
      a.download = nomDefaut;
      a.click();
      URL.revokeObjectURL(url);
    },
    onError: (e) => {
      const message = e instanceof Error ? e.message : 'Erreur inconnue';
      // Le navigateur lâche parfois la lecture du corps alors que les octets
      // sont déjà arrivés : le fichier se télécharge quand même.
      if (message === 'Failed to fetch') return;
      setErreur(`Génération du PDF impossible : ${message}`);
      setTimeout(() => setErreur(null), 5000);
    },
  });

  return (
    <>
      <button onClick={() => mutation.mutate()}
              disabled={!actif || mutation.isPending}
              className={`${BTN_PRIMAIRE} print:hidden`}
              style={{ background: DEGRADE }}>
        {mutation.isPending
          ? <Loader2 size={14} className="animate-spin" />
          : <FileText size={14} />}
        {mutation.isPending ? 'Génération…' : 'Télécharger'}
      </button>
      {erreur && (
        <span className="text-xs text-red-600 print:hidden">{erreur}</span>
      )}
    </>
  );
}

/**
 * Bandeau d'état d'une semaine.
 *
 * Une grille imprimée circule détachée de l'écran qui l'a produite. Elle doit
 * dire ce qu'elle vaut — et surtout signaler le cas coûteux : l'emploi du temps
 * a changé APRÈS que le suivi en a été tiré, donc après que des heures ont été
 * pointées, et potentiellement payées, sur une autre version.
 */
export function BandeauCoherence({ semaine, previsionnel }: {
  semaine?: SemaineIPGEI;
  /**
   * Annonce du prévisionnel malgré l'état de la semaine.
   *
   * `etat_coherence` et `suivi_genere_le` appartiennent à la SEMAINE, alors que
   * la prise de vue se fait classe par classe. Générer le suivi d'une seule
   * classe marque la semaine entière « alignée » : les autres classes
   * affichaient « à jour » au-dessus de séances archivées nulle part.
   */
  previsionnel?: boolean;
}) {
  if (!semaine) return null;

  const etat = previsionnel ? 'previsionnel' : semaine.etat_coherence;

  // RIEN quand tout va bien. « Suivi généré et à jour » ne dit pas autre chose
  // que l'absence de réserve : c'est le cas normal, et l'annoncer sur chaque
  // semaine ajoutait une ligne de jargon au-dessus de la grille.
  if (etat === 'aligne') return null;

  const styles = {
    previsionnel: { bg: '#f8fafc', bord: '#cbd5e1', texte: '#475569', Icone: CalendarClock },
    divergent:    { bg: '#fef2f2', bord: '#fca5a5', texte: '#b91c1c', Icone: AlertTriangle },
  }[etat] ?? null;
  if (!styles) return null;

  const { Icone } = styles;
  return (
    <div className="flex items-start gap-2 px-4 py-3 rounded-xl text-sm print:hidden"
         style={{ background: styles.bg, border: `1px solid ${styles.bord}`, color: styles.texte }}>
      <Icone size={16} style={{ flexShrink: 0, marginTop: 1 }} />
      <div>
        <span className="font-semibold">
          Semaine {semaine.numero} — {previsionnel
            ? 'Prévisionnel'
            : semaine.libelle_coherence}
        </span>
        {/* La DIVERGENCE garde son explication : elle est la seule à demander
            un geste — régénérer le suivi —, et dire seulement « modifié après
            la génération » laisserait chercher quoi faire. Le prévisionnel,
            lui, se comprend seul. */}
        {etat === 'divergent' && (
          <span className="block text-xs mt-0.5">
            Le pointage, la charge et les vacations de cette semaine reposent sur une
            version antérieure de l&apos;emploi du temps. Régénérez son suivi pour les
            réaligner — les pointages déjà saisis sont conservés.
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Regroupe les séances d'une case par matière et par type.
 *
 * Un TP dédoublé donne deux séances sur le même créneau ; sans regroupement,
 * la matière est réécrite à chaque fois et la case double de hauteur. Même
 * découpage que le PDF, pour qu'une grille lue à l'écran et la même imprimée
 * se ressemblent.
 */
function grouperParMatiere(seances: SeanceAffichable[], axe: AxeEDT) {
  // Ce que la ligne nomme dépend de l'axe : sur l'emploi du temps d'un
  // enseignant, répéter son nom n'apprend rien, c'est la classe qui manque.
  const texteLigne = (s: SeanceAffichable) => {
    const [principal, complement] =
      axe === 'prof'  ? [s.classe_nom, s.salle_nom]  :
      axe === 'salle' ? [s.prof_nom,   s.classe_nom] :
                        [s.prof_nom,   s.salle_nom];
    // Une séance spéciale — sport, instruction militaire — n'a ni enseignant
    // ni salle : la ligne serait vide, autant ne pas l'écrire.
    if (!principal && !complement && !s.sous_groupe_libelle) return '';
    let texte = principal || '—';
    if (s.sous_groupe_libelle) texte += ` (${s.sous_groupe_libelle})`;
    if (complement)            texte += ` — ${complement}`;
    return texte;
  };

  const blocs = new Map<string, {
    cle: string; type: string; intitule: string; speciale: boolean;
    lignes: LigneSeance[];
  }>();

  for (const s of seances) {
    const cle = `${s.matiere}__${s.type_seance}`;
    if (!blocs.has(cle)) {
      blocs.set(cle, {
        cle,
        type:     s.type_seance_libelle,
        // Sans matière, le type nomme seul la séance.
        intitule: s.matiere_intitule || s.matiere_code || s.type_seance_libelle,
        speciale: !!s.type_seance_special,
        lignes:   [],
      });
    }
    const texte = texteLigne(s);
    if (!texte) continue;
    blocs.get(cle)!.lignes.push({
      cle:         String(s.id),
      texte,
      annulee:     s.annulee,
      permutee:    s.origine === 'permutation',
      profInitial: s.prof_initial_nom,
    });
  }
  return [...blocs.values()];
}

// ── Grille ───────────────────────────────────────────────────────────────────
export function GrilleConsultation({
  seances, epreuves = [], axe, isLoading, titreImpression,
  sousTitresImpression = [], vide,
}: {
  seances: SeanceAffichable[];
  /**
   * Les épreuves de la semaine, posées EN SURIMPRESSION. Elles ne sont pas des
   * séances : leur durée ne tombe pas sur la grille de 1h30, elles convoquent
   * plusieurs classes à la fois, et elles n'ont ni salle ni enseignant.
   */
  epreuves?: EpreuveSurimpression[];
  axe: AxeEDT;
  isLoading?: boolean;
  titreImpression?: string;
  /**
   * Lignes du cartouche d'impression : semestre, numéro de semaine et dates
   * qui la bornent, année universitaire.
   *
   * Une grille imprimée circule détachée de l'écran qui l'a produite ; sans ces
   * repères, deux semaines se ressemblent au point d'être interchangeables.
   */
  sousTitresImpression?: string[];
  vide?: string;
}) {
  const { jours, creneaux, isLoading: chargeRef } = useReferentielsEDT();

  if (isLoading || chargeRef) return <div className={CARTE}><Chargement /></div>;
  // Une semaine sans cours mais AVEC une épreuve n'est pas une semaine vide :
  // c'est même la semaine d'examens, celle qu'on cherche le plus à consulter.
  if (seances.length === 0 && epreuves.length === 0) {
    return (
      <div className={CARTE}>
        <Vide texte={vide ?? "Aucune séance programmée sur cette semaine."} />
      </div>
    );
  }

  const dansLaCase = (jour: number, creneau: number) =>
    seances.filter(s => s.jour === jour && s.creneau === creneau);

  return (
    <div className={`${CARTE} overflow-hidden`}>
      {titreImpression && (
        <div className="hidden print:block px-4 py-3 border-b text-center">
          <div className="font-bold text-base">{titreImpression}</div>
          {sousTitresImpression.filter(Boolean).map(ligne => (
            <div key={ligne} className="text-xs mt-0.5">{ligne}</div>
          ))}
        </div>
      )}

      <div style={{ overflowX: 'auto' }}>
        <table style={STYLE_TABLE}>
          <thead>
            <tr style={STYLE_ENTETE_LIGNE}>
              <th style={STYLE_ENTETE_JOUR}>Jour</th>
              {creneaux.map(c => (
                <th key={c.id} style={STYLE_ENTETE_CRENEAU}>{c.creneau}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {jours.map((j, ligne) => (
              <tr key={j.id} style={{ background: ligne % 2 === 0 ? 'white' : '#fafafa' }}>
                <td style={STYLE_CELLULE_JOUR}>{j.jour}</td>
                {decouperLigne(creneaux, epreuves.filter(e => e.jour === j.id))
                  .map(cellule => (
                  cellule.type === 'epreuve' ? (
                    <td key={`ep-${cellule.epreuve.id}`} colSpan={cellule.span}
                        style={STYLE_CELLULE}>
                      <BandeauEpreuve
                        type={cellule.epreuve.type_epreuve}
                        matiere={cellule.epreuve.matiere_intitule
                                 || cellule.epreuve.matiere_code}
                        debut={cellule.epreuve.heure_debut}
                        fin={cellule.epreuve.heure_fin}
                        duree={cellule.epreuve.duree_libelle}
                        classes={axe === 'classe' ? undefined : cellule.epreuve.classes_noms}
                        observations={cellule.epreuve.observations}
                      />
                    </td>
                  ) : (
                    <td key={cellule.creneau.id} style={STYLE_CELLULE}>
                      {/* Colonne pleine hauteur : les cartes s'étirent pour
                          occuper la case, quel que soit leur nombre de lignes. */}
                      <div className="flex flex-col gap-1" style={{ height: '100%' }}>
                        {grouperParMatiere(dansLaCase(j.id, cellule.creneau.id), axe)
                          .map(bloc => (
                          <CarteMatiere
                            key={bloc.cle}
                            type={bloc.type}
                            intitule={bloc.intitule}
                            speciale={bloc.speciale}
                            lignes={bloc.lignes}
                          />
                        ))}
                      </div>
                    </td>
                  )
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="px-4 py-2.5 border-t border-gray-100 flex items-center gap-3 flex-wrap print:hidden">
        <span className="text-xs font-semibold text-iss-gray uppercase tracking-wide">Légende</span>
        {/* Construite à partir des types réellement présents, et non d'une
            liste figée : le référentiel est administrable, une légende écrite
            en dur y deviendrait fausse au premier type ajouté. */}
        {[...new Set(seances.map(s => s.type_seance_libelle).filter(Boolean))].map(libelle => {
          const coul = couleurType(libelle);
          return (
            <span key={libelle} className="inline-flex items-center gap-1.5 text-xs text-iss-gray">
              <span style={{
                width: 12, height: 12, borderRadius: 3,
                background: coul.bg, border: `1px solid ${coul.border}`, display: 'inline-block',
              }} />
              {coul.label === '—' ? libelle : coul.label}
            </span>
          );
        })}
        <span className="inline-flex items-center gap-1.5 text-xs text-iss-gray">
          <span style={{
            width: 12, height: 12, borderRadius: 3,
            background: 'transparent', border: '1px solid #7c3aed', display: 'inline-block',
          }} />
          Permutée
        </span>
        <span className="ml-auto text-xs text-iss-gray">
          {seances.length} séance{seances.length !== 1 ? 's' : ''}
        </span>
      </div>
    </div>
  );
}
