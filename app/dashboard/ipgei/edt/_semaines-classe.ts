'use client';

/**
 * Les semaines d'une CLASSE, lues sur son propre calendrier.
 *
 * Jusqu'ici, un écran de classe croisait le niveau de la classe avec la période
 * choisie à la connexion — « Semestres impairs » ou « pairs ». Ce réglage vaut
 * pour toute l'application, donc pour les deux années à la fois : le jour où
 * les MP passent en S4 pendant que les MPSI sont encore en S1, il devient faux
 * pour l'une des deux, et l'écran s'ouvre vide sans rien expliquer.
 *
 * Ici, la classe dit elle-même où elle en est : on prend TOUS les semestres de
 * son niveau pour l'année, et on en réunit les semaines dans l'ordre des dates.
 * La bascule d'un semestre à l'autre devient une semaine qui suit la
 * précédente, et l'étiquette du sélecteur nomme le semestre de chacune.
 */
import { useMemo } from 'react';

import { useSemaines, useSemestresAll } from '@/lib/api/ipgei-hooks';
import type { ClasseSelect, SemaineIPGEI, SemestreIPGEI } from '@/types/ipgei';

/** Les semestres du niveau d'une classe, dans l'ordre : impair puis pair. */
export function semestresDeLaClasse(
  semestres: SemestreIPGEI[], classe?: ClasseSelect | null,
): SemestreIPGEI[] {
  if (!classe) return [];
  // `niveaux` et non `niveau` : un semestre relève d'une année d'étude, que
  // MPSI et MPI partagent. La propriété au singulier ne rend que le premier
  // niveau du rang, et la classe MPSI ne trouvait alors plus son semestre.
  return semestres
    .filter(s => s.niveaux.includes(classe.niveau))
    .sort((a, b) => a.code.localeCompare(b.code));
}

/**
 * Les semaines de la classe, des deux semestres de son année, triées par date.
 *
 * Deux semestres au plus par niveau et par année : les deux appels couvrent
 * donc tout, et respectent l'ordre des hooks quand la classe change.
 */
export function useSemainesDeLaClasse(
  classe: ClasseSelect | null | undefined, annee: string,
): { semaines: SemaineIPGEI[]; semestres: SemestreIPGEI[] } {
  const { data: tousSemestres = [] } = useSemestresAll({ annee_universitaire: annee });
  const semestres = useMemo(
    () => semestresDeLaClasse(tousSemestres, classe),
    [tousSemestres, classe],
  );

  const { data: semainesA = [] } = useSemaines(semestres[0]?.id ?? null, classe?.id ?? null);
  const { data: semainesB = [] } = useSemaines(semestres[1]?.id ?? null, classe?.id ?? null);

  const semaines = useMemo(
    () => [...semainesA, ...semainesB]
      .sort((a, b) => a.date_debut.localeCompare(b.date_debut)),
    [semainesA, semainesB],
  );

  return { semaines, semestres };
}

/**
 * Toutes les semaines de l'année, tous semestres confondus.
 *
 * Pour les écrans qui TRAVERSENT les niveaux — l'emploi du temps d'un
 * enseignant, l'occupation d'une salle. Les filtrer sur la période de session
 * supposait que les deux années y soient ensemble ; le jour où les MP passent
 * en S4 et les MPSI restent en S1, la moitié du service disparaissait de
 * l'écran. Quatre semestres au plus par année : les quatre appels couvrent
 * tout, et gardent l'ordre des hooks.
 */
export function useSemainesDeLAnnee(annee: string): SemaineIPGEI[] {
  const { data: semestres = [] } = useSemestresAll({ annee_universitaire: annee });
  const ordonnes = useMemo(
    () => [...semestres].sort((a, b) => a.code.localeCompare(b.code)),
    [semestres],
  );

  const a = useSemaines(ordonnes[0]?.id ?? null);
  const b = useSemaines(ordonnes[1]?.id ?? null);
  const c = useSemaines(ordonnes[2]?.id ?? null);
  const d = useSemaines(ordonnes[3]?.id ?? null);

  return useMemo(
    () => [...(a.data ?? []), ...(b.data ?? []), ...(c.data ?? []), ...(d.data ?? [])]
      .sort((x, y) => x.date_debut.localeCompare(y.date_debut)),
    [a.data, b.data, c.data, d.data],
  );
}

/**
 * Le semestre d'une semaine donnée — celui que l'écran doit annoncer.
 *
 * Rendu vide tant qu'aucune semaine n'est choisie : mieux vaut ne rien dire que
 * nommer un semestre au hasard.
 */
export function semestreDeLaSemaine(
  semestres: SemestreIPGEI[], semaine?: SemaineIPGEI | null,
): SemestreIPGEI | undefined {
  if (!semaine) return undefined;
  return semestres.find(s => s.id === semaine.semestre);
}

/**
 * Le semestre où en est la classe AUJOURD'HUI.
 *
 * Celui de la semaine qui couvre la date du jour ; à défaut — vacances,
 * inter-semestres —, celui de la semaine la plus proche, en avant comme en
 * arrière, selon la même règle que la page de connexion. Le premier semestre
 * ferme la marche quand le calendrier est vide.
 *
 * Sert là où il faut un semestre AVANT tout choix de semaine : le patron d'une
 * grille, par exemple, qui n'est rattaché à aucune semaine.
 */
export function semestreCourantDeLaClasse(
  semestres: SemestreIPGEI[], semaines: SemaineIPGEI[],
): SemestreIPGEI | undefined {
  const cours = semaines.filter(s => s.type_semaine === 'cours');
  if (cours.length === 0) return semestres[0];
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const courante = cours.find(s => s.date_debut <= aujourdhui && aujourdhui <= s.date_fin);
  if (courante) return semestreDeLaSemaine(semestres, courante) ?? semestres[0];

  const distance = (s: SemaineIPGEI) => Math.min(
    Math.abs(Date.parse(s.date_debut) - Date.parse(aujourdhui)),
    Math.abs(Date.parse(s.date_fin) - Date.parse(aujourdhui)),
  );
  const proche = [...cours].sort((a, b) => distance(a) - distance(b))[0];
  return semestreDeLaSemaine(semestres, proche) ?? semestres[0];
}
