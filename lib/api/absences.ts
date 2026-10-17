import { apiFetch, apiUpload, apiFetchPaginated } from '@/lib/api';
import type {
  Etudiant, Presence, PresenceBulkPayload,
  RapportRow, SeuilAbsence, UploadJustificatifResponse, ImportResult,
} from '@/types/absences';
import type { PaginatedResponse } from '@/lib/api';
import { getOrFetch } from '@/lib/cache';

const TTL_5MIN = 5 * 60 * 1000;

// ─── Étudiants ──────────────────────────────────────────────────────────────

export function listEtudiants(
  params: Record<string, string | number> = {},
): Promise<PaginatedResponse<Etudiant>> {
  return apiFetchPaginated<Etudiant>('/api/v1/absences/etudiants/', params);
}

export function getEtudiantsParDep(departementId: number): Promise<Etudiant[]> {
  return getOrFetch(
    `etudiants:dep:${departementId}`,
    () => listEtudiants({ departement: departementId, page_size: 500 }).then(r => r.results),
    TTL_5MIN,
  );
}

export function importEtudiants(
  fichier: File,
  departementId?: number,
  onProgress?: (pct: number) => void,
): Promise<ImportResult> {
  const fd = new FormData();
  fd.append('fichier', fichier);
  if (departementId) fd.append('departement_id', String(departementId));
  return apiUpload<ImportResult>('/api/v1/absences/etudiants/importer/', fd, { onProgress });
}

// ─── Présences ──────────────────────────────────────────────────────────────

/** `justifiees_preservees` : lignes qui voulaient défaire une justifiée ;
 *  `justifiees_refusees` : lignes qui voulaient poser « J » sans le droit de
 *  justifier. Le serveur les ignore toutes deux (17/10/2026). */
export interface BulkPresencesResultat {
  updated: number;
  justifiees_preservees?: number;
  justifiees_refusees?: number;
}

export function bulkPresences(payload: PresenceBulkPayload): Promise<BulkPresencesResultat> {
  return apiFetch('/api/v1/absences/presences/bulk/', { method: 'POST', body: payload });
}

/** Le plafond de pagination du serveur (`core/pagination.py`,
 *  `max_page_size`). Au-delà, le surplus est TRONQUÉ en silence : une liste
 *  qui peut le dépasser se charge page après page (17/10/2026). */
export const PLAFOND_PAGE = 1000;

/** Toutes les lignes d'une liste paginée, page après page. Une erreur n'est
 *  pas avalée : une liste incomplète passerait pour la liste entière. */
export async function toutesLesPages<T>(chemin: string): Promise<T[]> {
  const sep = chemin.includes('?') ? '&' : '?';
  const lignes: T[] = [];
  for (let page = 1; ; page++) {
    const res = await apiFetch<{ results: T[]; pages?: number } | T[]>(
      `${chemin}${sep}page_size=${PLAFOND_PAGE}&page=${page}`,
    );
    if (Array.isArray(res)) { lignes.push(...res); break; }
    lignes.push(...res.results);
    if (!res.pages || page >= res.pages) break;
  }
  return lignes;
}

export function uploadJustificatifBySuivi(
  etudiantId: number,
  suiviId: number,
  file: File,
  onProgress?: (pct: number) => void,
): Promise<UploadJustificatifResponse> {
  const fd = new FormData();
  fd.append('etudiant_id', String(etudiantId));
  fd.append('suivi_id', String(suiviId));
  fd.append('justificatif', file);
  return apiUpload<UploadJustificatifResponse>(
    '/api/v1/absences/presences/upload-justificatif/',
    fd,
    { onProgress },
  );
}

export async function parEtudiant(etudiantId: number): Promise<Presence[]> {
  const res = await apiFetch<Presence[] | { results: Presence[] }>(
    `/api/v1/absences/presences/par-etudiant/?etudiant=${etudiantId}&page_size=500`,
  );
  return Array.isArray(res) ? res : (res.results ?? []);
}

export function supprimerJustificatif(presenceId: number): Promise<{ message: string }> {
  return apiFetch(`/api/v1/absences/presences/${presenceId}/supprimer-justificatif/`, {
    method: 'DELETE',
  });
}

export function changerStatut(
  presenceId: number,
  statut: number,
  commentaire?: string,
): Promise<Presence> {
  return apiFetch<Presence>(`/api/v1/absences/presences/${presenceId}/`, {
    method: 'PATCH',
    body: { statut, ...(commentaire !== undefined ? { commentaire } : {}) },
  });
}

export function listPresencesAvecJustificatif(
  anneeUniversitaire: string,
): Promise<PaginatedResponse<Presence>> {
  return apiFetchPaginated<Presence>('/api/v1/absences/presences/', {
    annee_universitaire: anneeUniversitaire,
    avec_justificatif: '1',
    statut: 1,
    page_size: 50,
  });
}

// ─── Rapport ────────────────────────────────────────────────────────────────

export function rapport(
  anneeUniversitaire: string,
  departementId?: string,
  dateDebut?: string,
  dateFin?: string,
): Promise<RapportRow[]> {
  const params = new URLSearchParams({ annee_universitaire: anneeUniversitaire });
  if (departementId) params.set('departement', departementId);
  if (dateDebut)     params.set('date_debut', dateDebut);
  if (dateFin)       params.set('date_fin', dateFin);
  return apiFetch<RapportRow[]>(`/api/v1/absences/presences/rapport/?${params}`);
}

// ─── Seuil ──────────────────────────────────────────────────────────────────

export function getSeuil(): Promise<SeuilAbsence> {
  return apiFetch<SeuilAbsence>('/api/v1/absences/seuil/');
}

export function updateSeuil(seuil: number): Promise<SeuilAbsence> {
  return apiFetch<SeuilAbsence>('/api/v1/absences/seuil/', { method: 'PATCH', body: { seuil } });
}
