'use client';

import type { SemaineIPGEI } from '@/types/ipgei';

/**
 * Semaine à proposer d'emblée dans un écran d'emploi du temps.
 *
 * Celle du jour, parce que c'est celle qu'on vient consulter neuf fois sur dix.
 * Hors période, on se rabat sur le bord le plus proche plutôt que sur la
 * première : un semestre terminé s'ouvrait sinon sur septembre, à seize
 * semaines de ce qu'on cherchait.
 *
 * Renvoie `null` si la liste est vide — l'appelant décide alors quoi afficher.
 */
export function semaineAProposer(semaines: SemaineIPGEI[]): SemaineIPGEI | null {
  if (semaines.length === 0) return null;

  // Comparaison sur les chaînes ISO : les dates viennent du serveur en
  // `AAAA-MM-JJ`, et les convertir en Date ferait entrer le fuseau du
  // navigateur dans une comparaison de jours.
  const aujourdhui = new Date().toISOString().slice(0, 10);

  const courante = semaines.find(s => s.date_debut <= aujourdhui && aujourdhui <= s.date_fin);
  if (courante) return courante;

  // Entre deux semaines — vacances, férié écarté de la liste — on prend la
  // suivante : on prépare plus souvent la semaine qui vient qu'on ne revient
  // sur celle qui s'achève.
  const suivante = semaines.find(s => s.date_debut > aujourdhui);
  if (suivante) return suivante;

  return semaines[semaines.length - 1];
}
