import { apiFetch, apiFetchPaginated } from '@/lib/api';

const BASE = '/api/v1/parametres/creneaux';

export interface Creneau {
  id:           number;
  creneau:      string;
  duree:        number;
  type_creneau: 'matin' | 'apres-midi' | 'soir';
  ordre:        number;
  is_actif:     boolean;
}

export interface CreneauInput {
  creneau:      string;
  duree:        number;
  type_creneau: 'matin' | 'apres-midi' | 'soir';
  ordre:        number;
  is_actif:     boolean;
}

export interface CreneauxListFilters { page?: number; search?: string; }

export const creneauxApi = {
  /**
   * Tous les créneaux actifs, sans pagination.
   *
   * Indispensable pour les grilles d'emploi du temps : la liste paginée
   * plafonne à 10 éléments, or les créneaux inactifs conservés (historique)
   * s'y intercalent — une grille bâtie dessus perdait silencieusement des
   * colonnes de fin de journée.
   */
  actifs: () => apiFetch<Creneau[]>(`${BASE}/all/`, { params: { is_actif: 'true' } }),

  list: (filters: CreneauxListFilters = {}) => {
    const params: Record<string, string | number> = {};
    if (filters.page)   params.page   = filters.page;
    if (filters.search) params.search = filters.search;
    return apiFetchPaginated<Creneau>(`${BASE}/`, params);
  },
  retrieve: (id: number) => apiFetch<Creneau>(`${BASE}/${id}/`),
  create:   (input: CreneauInput) => apiFetch<Creneau>(`${BASE}/`, { method: 'POST', body: input }),
  update:   (id: number, input: Partial<CreneauInput>) =>
    apiFetch<Creneau>(`${BASE}/${id}/`, { method: 'PATCH', body: input }),

  /**
   * Saisie de la durée d'un créneau.
   *
   * Le reste (libellé, ordre, statut) est un miroir de SIGA et reste verrouillé
   * côté serveur : seule la durée se règle dans IPGEI.
   */
  setDuree: (id: number, duree: number) =>
    apiFetch<Creneau>(`${BASE}/${id}/`, { method: 'PATCH', body: { duree } }),
  remove:   (id: number) => apiFetch<void>(`${BASE}/${id}/`, { method: 'DELETE' }),
};
