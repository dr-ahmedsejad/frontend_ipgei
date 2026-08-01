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
  AlertTriangle, CalendarClock, CheckCircle2, ChevronLeft, ChevronRight,
  FileText, Loader2,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';

import { apiFetchBlob } from '@/lib/api';

import { BTN_PRIMAIRE, CARTE, Chargement, DEGRADE, SELECT, Vide } from '../_ui';
import {
  CarteMatiere, type LigneSeance,
  STYLE_CELLULE, STYLE_CELLULE_JOUR, STYLE_ENTETE_CRENEAU,
  STYLE_ENTETE_JOUR, STYLE_ENTETE_LIGNE, STYLE_TABLE, couleurType,
} from './_cellule';
import { useReferentielsEDT } from './_referentiels';
import {
  TYPES_SEANCE, type SeanceReelle, type SemaineIPGEI, type TypeSeance,
} from '@/types/ipgei';

/** Axe de lecture : détermine ce que la carte met en avant. */
export type AxeEDT = 'classe' | 'prof' | 'salle';

// ── Navigation par semaine, commune aux trois vues ───────────────────────────
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
              className="p-2.5 rounded-xl border border-gray-200 text-iss-gray hover:bg-gray-50 disabled:opacity-40 transition-colors">
        <ChevronLeft size={14} />
      </button>
      <select value={semaineId ?? ''} className={SELECT} style={{ minWidth: 180 }}
              onChange={e => onChange(e.target.value ? Number(e.target.value) : null)}>
        <option value="">—</option>
        {cours.map(s => (
          <option key={s.id} value={s.id}>
            S{s.numero} · {new Date(s.date_debut).toLocaleDateString('fr-FR')}
          </option>
        ))}
      </select>
      <button onClick={() => cours[index + 1] && onChange(cours[index + 1].id)}
              disabled={index < 0 || index >= cours.length - 1} title="Semaine suivante"
              className="p-2.5 rounded-xl border border-gray-200 text-iss-gray hover:bg-gray-50 disabled:opacity-40 transition-colors">
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
export function BandeauCoherence({ semaine }: { semaine?: SemaineIPGEI }) {
  if (!semaine) return null;

  const styles = {
    previsionnel: { bg: '#f8fafc', bord: '#cbd5e1', texte: '#475569', Icone: CalendarClock },
    aligne:       { bg: '#f0fdf4', bord: '#86efac', texte: '#166534', Icone: CheckCircle2 },
    divergent:    { bg: '#fef2f2', bord: '#fca5a5', texte: '#b91c1c', Icone: AlertTriangle },
  }[semaine.etat_coherence] ?? null;
  if (!styles) return null;

  const { Icone } = styles;
  return (
    <div className="flex items-start gap-2 px-4 py-3 rounded-xl text-sm print:hidden"
         style={{ background: styles.bg, border: `1px solid ${styles.bord}`, color: styles.texte }}>
      <Icone size={16} style={{ flexShrink: 0, marginTop: 1 }} />
      <div>
        <span className="font-semibold">
          Semaine {semaine.numero} — {semaine.libelle_coherence}
        </span>
        {semaine.etat_coherence === 'divergent' && (
          <span className="block text-xs mt-0.5">
            Le pointage, la charge et les vacations de cette semaine reposent sur une
            version antérieure de l&apos;emploi du temps. Régénérez son suivi pour les
            réaligner — les pointages déjà saisis sont conservés.
          </span>
        )}
        {semaine.etat_coherence === 'previsionnel' && (
          <span className="block text-xs mt-0.5">
            Aucun suivi n&apos;a encore été généré : ce document est prévisionnel et
            peut encore changer.
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
function grouperParMatiere(seances: SeanceReelle[], axe: AxeEDT) {
  // Ce que la ligne nomme dépend de l'axe : sur l'emploi du temps d'un
  // enseignant, répéter son nom n'apprend rien, c'est la classe qui manque.
  const texteLigne = (s: SeanceReelle) => {
    const [principal, complement] =
      axe === 'prof'  ? [s.classe_nom, s.salle_nom]  :
      axe === 'salle' ? [s.prof_nom,   s.classe_nom] :
                        [s.prof_nom,   s.salle_nom];
    let texte = principal || '—';
    if (s.sous_groupe_libelle) texte += ` (${s.sous_groupe_libelle})`;
    if (complement)            texte += ` — ${complement}`;
    return texte;
  };

  const blocs = new Map<string, {
    cle: string; type: TypeSeance; intitule: string; lignes: LigneSeance[];
  }>();

  for (const s of seances) {
    const cle = `${s.matiere}__${s.type_seance}`;
    if (!blocs.has(cle)) {
      blocs.set(cle, {
        cle,
        type:     s.type_seance,
        intitule: s.matiere_intitule || s.matiere_code,
        lignes:   [],
      });
    }
    blocs.get(cle)!.lignes.push({
      cle:         String(s.id),
      texte:       texteLigne(s),
      annulee:     s.annulee,
      permutee:    s.origine === 'permutation',
      profInitial: s.prof_initial_nom,
    });
  }
  return [...blocs.values()];
}

// ── Grille ───────────────────────────────────────────────────────────────────
export function GrilleConsultation({
  seances, axe, isLoading, titreImpression, sousTitresImpression = [], vide,
}: {
  seances: SeanceReelle[];
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
  if (seances.length === 0) {
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
                {creneaux.map(c => (
                  <td key={c.id} style={STYLE_CELLULE}>
                    {/* Colonne pleine hauteur : les cartes s'étirent pour
                        occuper la case, quel que soit leur nombre de lignes. */}
                    <div className="flex flex-col gap-1" style={{ height: '100%' }}>
                      {grouperParMatiere(dansLaCase(j.id, c.id), axe).map(bloc => (
                        <CarteMatiere
                          key={bloc.cle}
                          type={bloc.type}
                          intitule={bloc.intitule}
                          lignes={bloc.lignes}
                        />
                      ))}
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="px-4 py-2.5 border-t border-gray-100 flex items-center gap-3 flex-wrap print:hidden">
        <span className="text-xs font-semibold text-iss-gray uppercase tracking-wide">Légende</span>
        {TYPES_SEANCE.map(t => {
          const coul = couleurType(t.value);
          return (
            <span key={t.value} className="inline-flex items-center gap-1.5 text-xs text-iss-gray">
              <span style={{
                width: 12, height: 12, borderRadius: 3,
                background: coul.bg, border: `1px solid ${coul.border}`, display: 'inline-block',
              }} />
              {t.label}
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
