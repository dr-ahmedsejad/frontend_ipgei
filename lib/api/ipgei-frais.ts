'use client';

/**
 * Grille tarifaire des frais d'inscription.
 *
 * L'API est celle du socle (`/inscriptions/grilles-frais/`) : la grille est
 * tenue par la scolarité pour tout l'établissement, IPGEI compris. On ne la
 * duplique donc pas — seul l'écran est propre à la prépa, pour parler de
 * « 1re année » et de « 2e année » plutôt que de « niveau 1 » et « niveau 2 ».
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api';
import { anneesApi, type Year } from '@/lib/api/annees';

const BASE = '/api/v1/inscriptions';

/** MPSI est la 1re année, MP la 2e : c'est ainsi que le socle les numérote. */
export const NIVEAU_PREPA = [
  { niveau: 1, label: '1re année — MPSI' },
  { niveau: 2, label: '2e année — MP' },
] as const;

export interface GrilleFrais {
  id:                 number;
  annee_univ:         number;
  annee_univ_label:   string;
  type_diplome:       string;
  type_diplome_label: string;
  niveau:             number;
  montant:            string;
  actif:              boolean;
}

export interface GrilleFraisInput {
  annee_univ:   number;
  type_diplome: string;
  niveau:       number;
  montant:      string;
  actif:        boolean;
}

const cle = ['ipgei', 'grilles-frais'] as const;

export type { Year };

export function useGrillesFrais(annee?: number | null) {
  return useQuery({
    queryKey: [...cle, annee ?? 0] as const,
    queryFn:  () => apiFetch<{ results: GrilleFrais[] } | GrilleFrais[]>(
      `${BASE}/grilles-frais/`,
      { params: { page_size: 200, ...(annee ? { annee_univ: annee } : {}) } },
    ).then(r => (Array.isArray(r) ? r : r.results ?? [])),
  });
}

export function useAnneesUniv() {
  return useQuery({
    queryKey: ['ipgei', 'annees-univ'] as const,
    queryFn:  () => anneesApi.list({ page: 1 }).then(r => r.results),
    staleTime: 5 * 60 * 1000,
  });
}

export function useGrilleFraisMutations() {
  const qc = useQueryClient();
  const invalider = () => qc.invalidateQueries({ queryKey: cle });

  return {
    create: useMutation({
      mutationFn: (input: GrilleFraisInput) =>
        apiFetch<GrilleFrais>(`${BASE}/grilles-frais/`, { method: 'POST', body: input }),
      onSuccess: invalider,
    }),
    update: useMutation({
      mutationFn: ({ id, input }: { id: number; input: Partial<GrilleFraisInput> }) =>
        apiFetch<GrilleFrais>(`${BASE}/grilles-frais/${id}/`, { method: 'PATCH', body: input }),
      onSuccess: invalider,
    }),
    remove: useMutation({
      mutationFn: (id: number) =>
        apiFetch<void>(`${BASE}/grilles-frais/${id}/`, { method: 'DELETE' }),
      onSuccess: invalider,
    }),
  };
}
