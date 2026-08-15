/** API du module Cours. */
import { apiFetch, apiUpload } from '@/lib/api';
import type { Cours, CoursEM, CoursReponse, LinkPreview } from '@/types/cours';

const BASE = '/api/v1/cours';

function unwrap<T>(r: T[] | { results: T[] }): T[] {
    return Array.isArray(r) ? r : (r?.results ?? []);
}

export const coursApi = {
    /** EMs de l'utilisateur (enseignés et/ou où il est inscrit) + droit de publier. */
    mesEms: (annee?: string): Promise<CoursEM[]> =>
        apiFetch<CoursEM[]>(`${BASE}/mes-ems/${annee ? `?annee_universitaire=${encodeURIComponent(annee)}` : ''}`),

    /** Fil des cours d'un EM (année). */
    list: async (em: number, annee?: string): Promise<Cours[]> =>
        unwrap(await apiFetch<Cours[] | { results: Cours[] }>(
            `${BASE}/?em=${em}&page_size=200${annee ? `&annee_universitaire=${encodeURIComponent(annee)}` : ''}`)),

    /** Publie un cours (multipart : fichiers + liens JSON). */
    create: (fd: FormData): Promise<Cours> => apiUpload<Cours>(`${BASE}/`, fd),

    /** Ajoute une réponse à un cours (parent = réponse ciblée, optionnel). */
    repondre: (id: number, contenu: string, parent?: number): Promise<CoursReponse> =>
        apiFetch<CoursReponse>(`${BASE}/${id}/repondre/`, {
            method: 'POST', body: parent ? { contenu, parent } : { contenu },
        }),

    /** Modifie SA réponse (propriétaire ou admin). */
    modifierReponse: (coursId: number, repId: number, contenu: string): Promise<CoursReponse> =>
        apiFetch<CoursReponse>(`${BASE}/${coursId}/reponses/${repId}/`, {
            method: 'PATCH', body: { contenu },
        }),

    /** Supprime SA réponse (propriétaire ou admin). */
    supprimerReponse: (coursId: number, repId: number): Promise<void> =>
        apiFetch<void>(`${BASE}/${coursId}/reponses/${repId}/`, { method: 'DELETE' }),

    /** Prévisualisation d'un lien externe (embed vidéo + OpenGraph). */
    apercuLien: (url: string): Promise<LinkPreview> =>
        apiFetch<LinkPreview>(`${BASE}/apercu-lien/?url=${encodeURIComponent(url)}`),

    /** Supprime un cours (auteur / admin). */
    remove: (id: number): Promise<void> =>
        apiFetch<void>(`${BASE}/${id}/`, { method: 'DELETE' }),
};
