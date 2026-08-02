'use client';

/**
 * Référentiels partagés par les écrans d'emploi du temps : jours, créneaux,
 * salles, enseignants et types de séance. Ils changent rarement — on les charge en une fois et
 * TanStack Query les garde en cache pour toute la navigation EDT.
 */
import { useQuery } from '@tanstack/react-query';

import { creneauxApi } from '@/lib/api/creneaux';
import { joursApi } from '@/lib/api/jours';
import { profsApi } from '@/lib/api/profs';
import { sallesApi } from '@/lib/api/salles';
import { seancesApi } from '@/lib/api/seances';

const CINQ_MINUTES = 5 * 60 * 1000;

export function useReferentielsEDT() {
  const jours = useQuery({
    queryKey: ['ipgei', 'ref', 'jours'],
    queryFn:  () => joursApi.list({ page: 1 }),
    staleTime: CINQ_MINUTES,
  });

  // `actifs()` et non `list()` : la liste paginée s'arrête à 10 éléments et les
  // créneaux désactivés (conservés pour l'historique) s'y intercalent, ce qui
  // amputait la grille de ses derniers créneaux de la journée.
  const creneaux = useQuery({
    queryKey: ['ipgei', 'ref', 'creneaux'],
    queryFn:  () => creneauxApi.actifs(),
    staleTime: CINQ_MINUTES,
  });

  const salles = useQuery({
    queryKey: ['ipgei', 'ref', 'salles'],
    queryFn:  () => sallesApi.list({ page: 1, page_size: 200 }),
    staleTime: CINQ_MINUTES,
  });

  const profs = useQuery({
    queryKey: ['ipgei', 'ref', 'profs'],
    queryFn:  () => profsApi.list({ page: 1, page_size: 300, actif: true }),
    staleTime: CINQ_MINUTES,
  });

  // Types de séance : le référentiel du socle (« Paramètres → Séances »), et
  // non plus une liste figée dans le code. Un type ajouté là devient
  // disponible dans la grille sans toucher au frontend.
  const typesSeance = useQuery({
    queryKey: ['ipgei', 'ref', 'types-seance'],
    queryFn:  () => seancesApi.list({ page: 1 }),
    staleTime: CINQ_MINUTES,
  });

  return {
    typesSeance: typesSeance.data?.results ?? [],
    // Les créneaux pilotent les lignes de la grille : on respecte leur ordre
    // d'affichage et on écarte ceux désactivés.
    jours:    jours.data?.results ?? [],
    creneaux: [...(creneaux.data ?? [])].sort((a, b) => a.ordre - b.ordre),
    salles:   salles.data?.results ?? [],
    profs:    profs.data?.results ?? [],
    isLoading: jours.isLoading || creneaux.isLoading || typesSeance.isLoading,
  };
}
