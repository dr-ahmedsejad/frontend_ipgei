import { apiFetch, apiFetchPaginated } from '@/lib/api';

const BASE = '/api/v1/auth/users';

export interface User {
  id:          number;
  username:    string;
  name:        string;
  email:       string;
  role:        string;
  is_active:   boolean;
  date_joined: string;
}

export interface ResultatReinitialisation {
  detail:            string;
  /** Le mot de passe engendré, ou `null` si l'administrateur l'a fourni. */
  mot_de_passe:      string | null;
  doit_changer_mdp:  boolean;
}

export interface ComptesListFilters {
  page?:   number;
  search?: string;
  role?:   string;
}

export const comptesApi = {
  list: (filters: ComptesListFilters = {}) => {
    const params: Record<string, string | number> = {};
    if (filters.page)   params.page   = filters.page;
    if (filters.search) params.search = filters.search;
    if (filters.role)   params.role   = filters.role;
    return apiFetchPaginated<User>(`${BASE}/`, params);
  },

  retrieve: (id: number) => apiFetch<User>(`${BASE}/${id}/`),

  remove: (id: number) =>
    apiFetch<void>(`${BASE}/${id}/`, { method: 'DELETE' }),

  toggleActive: (id: number) =>
    apiFetch<User>(`${BASE}/${id}/toggle-active/`, { method: 'POST' }),

  /**
   * Repose un mot de passe sur un compte.
   *
   * Sans `nouveau`, le serveur en engendre un et le renvoie UNE SEULE FOIS —
   * il n'est stocké nulle part en clair et ne peut pas être relu.
   */
  reinitialiserMotDePasse: (id: number, nouveau?: string) =>
    apiFetch<ResultatReinitialisation>(
      `${BASE}/${id}/reinitialiser-mot-de-passe/`,
      { method: 'POST', body: JSON.stringify(
        nouveau ? { nouveau_mot_de_passe: nouveau } : {}) },
    ),
};
