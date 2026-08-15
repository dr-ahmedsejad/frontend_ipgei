import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { syncApi } from './sync';

/** Clés de cache du domaine — une seule famille, trois entrées. */
export const syncKeys = {
  all:        ['sync'] as const,
  instance:   () => [...syncKeys.all, 'instance'] as const,
  historique: () => [...syncKeys.all, 'historique'] as const,
};

/**
 * Le rôle de l'instance ne change pas en cours de session : il est fixé par une
 * variable d'environnement au démarrage du serveur. On le garde donc longtemps
 * en cache — le redemander à chaque écran serait une requête pour rien.
 */
export function useInstance() {
  return useQuery({
    queryKey: syncKeys.instance(),
    queryFn:  syncApi.instance,
    staleTime: 30 * 60 * 1000,
  });
}

export function useHistoriqueSync(actif = true) {
  return useQuery({
    queryKey: syncKeys.historique(),
    queryFn:  syncApi.historique,
    enabled:  actif,
  });
}

export function useSyncMutations() {
  const qc = useQueryClient();
  return {
    publier: useMutation({
      mutationFn: syncApi.publier,
      // L'historique gagne une ligne à chaque tentative, réussie ou non.
      onSettled: () => qc.invalidateQueries({ queryKey: syncKeys.historique() }),
    }),
  };
}
