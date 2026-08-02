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
import { seancesApi, type Seance } from '@/lib/api/seances';

/**
 * Types de séance de la prépa, dans l'ordre où on les rencontre : les
 * enseignements, puis les créneaux bloqués sans enseignant, puis les
 * évaluations.
 */
const ORDRE_TYPES = [
  'CM', 'TD', 'TP', 'PR',
  'Sport', 'Instruction militaire',
  'DS', 'EF', 'ER',
];

/**
 * Types du référentiel qui ne se planifient pas dans un emploi du temps de
 * classe : ils concernent le service d'un enseignant, pas les étudiants.
 */
const TYPES_ECARTES = ['Surveillance', 'Mission', 'Encadrement'];

/**
 * Écarte ce qui n'a pas sa place dans une grille de classe, puis applique
 * l'ordre ci-dessus. Un type absent de la liste — ajouté plus tard dans
 * « Paramètres → Séances » — passe à la fin plutôt que de disparaître
 * silencieusement.
 */
function ordonnerTypes(types: Seance[]): Seance[] {
  return types
    .filter(t => !TYPES_ECARTES.includes(t.type_seance))
    .sort((a, b) => {
      const ia = ORDRE_TYPES.indexOf(a.type_seance);
      const ib = ORDRE_TYPES.indexOf(b.type_seance);
      if (ia === -1 && ib === -1) return a.type_seance.localeCompare(b.type_seance);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
}

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
    // La clé porte « all » : elle a changé en même temps que la forme de la
    // réponse. Sans cela, le cache resservait l'ancienne page paginée — un
    // objet là où le code attend un tableau, d'où « map is not a function ».
    queryKey: ['ipgei', 'ref', 'types-seance', 'all'],
    queryFn:  () => seancesApi.all(),
    staleTime: CINQ_MINUTES,
  });

  return {
    // Garde de forme : un cache d'une version antérieure, ou une réponse
    // enveloppée, ne doit pas casser l'écran entier.
    typesSeance: ordonnerTypes(
      Array.isArray(typesSeance.data) ? typesSeance.data : []),
    // Les créneaux pilotent les lignes de la grille : on respecte leur ordre
    // d'affichage et on écarte ceux désactivés.
    jours:    jours.data?.results ?? [],
    creneaux: [...(creneaux.data ?? [])].sort((a, b) => a.ordre - b.ordre),
    salles:   salles.data?.results ?? [],
    profs:    profs.data?.results ?? [],
    isLoading: jours.isLoading || creneaux.isLoading || typesSeance.isLoading,
  };
}
