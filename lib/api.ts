import { getQueryClient } from './query-client';
import { invalidateAll as invalidateMemoryCache } from './cache';
import { rafraichirSession } from './session-partagee';

/**
 * Base URL de l'API backend. Source unique de vérité — ne PAS référencer
 * `process.env.NEXT_PUBLIC_API_URL` directement ailleurs (utiliser cette
 * constante ou le helper `apiUrl()`). Voir règle ESLint no-restricted-syntax.
 *
 * Résolution :
 *  1. `NEXT_PUBLIC_API_URL` s'il est défini (override explicite, ex. backend distant) ;
 *  2. sinon l'hôte du NAVIGATEUR sur le port 8000 → fonctionne EN LOCALHOST comme
 *     EN LAN sans reconfiguration (localhost:3001 → localhost:8000 ;
 *     10.8.30.252:3001 → 10.8.30.252:8000) ;
 *  3. fallback SSR (pas de `window`) : localhost:8000.
 */
function resolveApiBase(): string {
  const configured = process.env.NEXT_PUBLIC_API_URL;
  if (configured) return configured;
  if (typeof window !== 'undefined' && window.location?.hostname) {
    return `${window.location.protocol}//${window.location.hostname}:8000`;
  }
  return 'http://localhost:8000';
}

export const API_BASE_URL = resolveApiBase();
// Les erreurs du serveur : message lisible + erreurs par champ (lib/erreurs-api.ts).
import { ErreurApi, champsErreur, lireErreur as _lireErreur } from './erreurs-api';
export { ErreurApi, champsErreur };

const API = API_BASE_URL;   // alias interne, conserve pour minimiser le diff

/**
 * Construit une URL absolue vers le backend.
 * @param path — chemin relatif, avec ou sans slash initial.
 * @example apiUrl('/api/v1/auth/login/') → 'http://localhost:8000/api/v1/auth/login/'
 */
export function apiUrl(path: string): string {
  return `${API_BASE_URL}${path.startsWith('/') ? path : '/' + path}`;
}

/**
 * Message d'erreur sentinelle : abort réseau silencieux survenant pendant/juste
 * après un téléchargement blob (le browser annule les requêtes en vol). Les
 * appelants comparent contre cette constante pour supprimer le toast parasite.
 */
export const SILENT_NETWORK_ABORT = '__SILENT_NETWORK_ABORT__';

export interface PaginatedResponse<T> {
  count:    number;
  pages:    number;
  next:     string | null;
  previous: string | null;
  results:  T[];
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

interface FetchOptions {
  method?: Method;
  body?:   unknown;
  params?: Record<string, string | number | boolean>;
}

// ── Renouvellement du jeton ──────────────────────────────────────────────────
// Un seul à la fois dans TOUT le navigateur (onglets compris) : voir
// lib/session-partagee.ts. Si N requêtes reçoivent un 401, elles attendent le
// même renouvellement.
async function _refreshToken(): Promise<boolean> {
  return rafraichirSession(`${API}/api/v1/auth/token/refresh/`);
}

/** Routes publiques qui ne nécessitent pas d'authentification. */
const PUBLIC_PREFIXES = ['/preinscription', '/verifier', '/login'];

function _forceLogout(fallbackPath?: string): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('gesafped_user');
  localStorage.removeItem('gesafped_modules');
  // M-A + Sec-D : purge synchrone (import statique) — TanStack Query ET cache
  // mémoire `lib/cache.ts`. Évite que le user suivant voie les données du
  // précédent (filieres/semestres/institution mises en cache 5 min via getOrFetch).
  try { getQueryClient().clear(); } catch { /* silent */ }
  try { invalidateMemoryCache(); }   catch { /* silent */ }
  // Signale les autres onglets (le listener est dans dashboard/layout.tsx).
  try { localStorage.setItem('gesafped_logout', String(Date.now())); } catch { /* silent */ }
  const current = fallbackPath ?? (window.location.pathname + window.location.search);
  // Ne pas rediriger si on est déjà sur une route publique
  if (PUBLIC_PREFIXES.some(p => current.startsWith(p))) return;
  const redirect = `/login?next=${encodeURIComponent(current)}`;
  window.location.href = redirect;
}
// ─────────────────────────────────────────────────────────────────────────────

export async function apiFetch<T = unknown>(path: string, options: FetchOptions = {}): Promise<T> {
  const { method = 'GET', body, params } = options;

  let url = `${API}${path}`;
  if (params && Object.keys(params).length > 0) {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)]))
    ).toString();
    url = `${url}?${qs}`;
  }

  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
  const headers: Record<string, string> = {};
  if (body !== undefined && !isFormData) headers['Content-Type'] = 'application/json';

  // Sec-G : si le backend pose un cookie `csrftoken` (Django + dj-rest-auth
  // CSRFCheck), le renvoyer en header sur les requêtes mutantes. No-op si le
  // cookie n'existe pas (auth JWT pure sans CSRF).
  if (method !== 'GET' && typeof document !== 'undefined') {
    const csrfMatch = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/);
    if (csrfMatch) headers['X-CSRFToken'] = decodeURIComponent(csrfMatch[1]);
  }

  const init: RequestInit = {
    method,
    credentials: 'include',
    headers,
    ...(isFormData ? { body: body as FormData } : body !== undefined ? { body: JSON.stringify(body) } : {}),
  };

  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (err) {
    // "Failed to fetch" survenant pendant/juste après un téléchargement blob :
    // le browser annule les autres requêtes — silencieusement ignorer pour
    // éviter le toast parasite. Sinon, propager l'erreur normalement.
    const { isDownloadingRecently } = await import('./downloadBlob');
    if (isDownloadingRecently()) {
      throw new Error(SILENT_NETWORK_ABORT);
    }
    throw err;
  }

  // Auto-refresh JWT on 401 — singleton évite les refreshes parallèles
  if (res.status === 401) {
    const refreshed = await _refreshToken();
    if (refreshed) {
      res = await fetch(url, init);
    } else {
      _forceLogout();
      throw new Error('Session expirée. Veuillez vous reconnecter.');
    }
  }

  // Retry lui-même a retourné 401 (token révoqué côté serveur)
  if (res.status === 401) {
    _forceLogout();
    throw new Error('Session expirée. Veuillez vous reconnecter.');
  }

  if (res.status === 204) return undefined as T;

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    // Le serveur enveloppe ses erreurs (core/exceptions.py) ; elles se lisent
    // ici une fois pour tous les écrans : message lisible tel quel, erreurs
    // par champ sur `champs` (16/10/2026 — on affichait le JSON brut, ou
    // « status : 400 » dans les écrans qui le décodaient).
    const { msg, champs } = _lireErreur(data, res.status, undefined);
    // Inclure le request_id (côté serveur) UNIQUEMENT pour les 5xx : ça donne
    // une référence à l'utilisateur pour contacter le support sans exposer de
    // détails techniques. Les 4xx restent inchangés (messages métier explicites).
    const requestId: string | null =
      data?.request_id || res.headers.get('X-Request-Id') || null;
    if (res.status >= 500 && requestId) {
      throw new ErreurApi(`${msg} (Réf: ${requestId})`, res.status, champs);
    }
    throw new ErreurApi(msg, res.status, champs);
  }

  return data as T;
}

/**
 * Upload multipart/form-data (photo, document…) avec suivi de progression.
 * `onProgress(0‥100)` est appelé à chaque chunk si le navigateur le supporte.
 */
export async function apiUpload<T = unknown>(
  path: string,
  formData: FormData,
  options: { method?: 'POST' | 'PUT' | 'PATCH'; onProgress?: (pct: number) => void } = {},
): Promise<T> {
  const { method = 'POST', onProgress } = options;
  const url = `${API}${path}`;

  // XMLHttpRequest pour le suivi de progression (fetch ne l'expose pas nativement)
  if (onProgress) {
    return new Promise<T>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.withCredentials = true;
      xhr.open(method, url);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => {
        if (xhr.status === 401) { _forceLogout(); reject(new Error('Session expirée.')); return; }
        if (xhr.status === 204)  { resolve(undefined as T); return; }
        try {
          const data = JSON.parse(xhr.responseText);
          if (xhr.status >= 200 && xhr.status < 300) resolve(data as T);
          else {
            // Même lecture qu'apiFetch : message lisible, erreurs par champ.
            const { msg, champs } = _lireErreur(data, xhr.status, undefined);
            reject(new ErreurApi(msg, xhr.status, champs));
          }
        } catch { reject(new Error(`Erreur ${xhr.status}`)); }
      };
      xhr.onerror = () => reject(new Error('Erreur réseau'));
      xhr.send(formData);
    });
  }

  // Sans suivi de progression → apiFetch standard (FormData détecté automatiquement)
  return apiFetch<T>(path, { method, body: formData });
}

/** Télécharge une ressource binaire (PDF, etc.) avec les mêmes cookies/refresh JWT qu'apiFetch. */
/**
 * Le motif d'un refus, tel qu'on peut le montrer à l'utilisateur.
 *
 * Le backend enveloppe ses erreurs : `{status, error|errors, request_id}`.
 * Aplatir cette enveloppe telle quelle donnait « 400 <le vrai message>
 * d0d8edc2 » — le code HTTP et la référence de log encadrant une phrase qui,
 * elle, se suffisait. On ne garde que le message ; `request_id` sert au
 * support, pas à l'écran.
 */
function motifOuNull(donnees: unknown): string | null {
  if (!donnees || typeof donnees !== 'object') return null;
  const d = donnees as Record<string, unknown>;

  const premierTexte = (valeur: unknown): string | null => {
    if (typeof valeur === 'string') return valeur;
    if (Array.isArray(valeur)) {
      for (const v of valeur) {
        const t = premierTexte(v);
        if (t) return t;
      }
      return null;
    }
    if (valeur && typeof valeur === 'object') {
      // Erreurs par champ : on rend les messages, jamais les noms de champs.
      const messages = Object.values(valeur as Record<string, unknown>)
        .map(premierTexte).filter(Boolean);
      return messages.length ? messages.join(' ') : null;
    }
    return null;
  };

  return premierTexte(d.error ?? d.detail ?? d.message ?? d.errors);
}

function motifDuRefus(donnees: unknown, statut: number): string {
  return motifOuNull(donnees) ?? `Erreur ${statut}`;
}

/**
 * Le message d'une erreur levée par `apiFetch`, prêt à être affiché.
 *
 * `apiFetch` livre les erreurs PAR CHAMP sous forme de JSON — une douzaine
 * d'écrans en dépendent : ils le relisent avec `JSON.parse` pour poser le
 * message sous le bon champ. Ce contrat ne bouge pas.
 *
 * Mais un écran qui se contente d'un bandeau, lui, affichait ce JSON tel
 * quel : `{"acronyme":["Ce sigle est déjà utilisé…"]}`. On aplatit donc ici,
 * en ne gardant que les messages — jamais les noms de champs, qui sont ceux
 * du modèle et pas ceux de l'écran.
 */
export function messageLisible(err: unknown): string {
  const brut = err instanceof Error ? err.message : String(err ?? '');
  const debut = brut.trimStart();
  if (!debut.startsWith('{') && !debut.startsWith('[')) return brut;
  try {
    return motifOuNull({ errors: JSON.parse(brut) }) ?? brut;
  } catch {
    return brut;
  }
}

export async function apiFetchBlob(path: string, params?: Record<string, string>): Promise<Blob> {
  let url = `${API}${path}`;
  if (params && Object.keys(params).length > 0) {
    url = `${url}?${new URLSearchParams(params)}`;
  }
  const init: RequestInit = { method: 'GET', credentials: 'include' };

  // Marque le download dès le DÉBUT (avant fetch), pour que toute requête
  // parallèle qui échoue pendant la génération PDF/Excel soit silencieusement
  // ignorée par apiFetch via isDownloadingRecently().
  const { markDownloadStart, markDownloadEnd } = await import('./downloadBlob');
  markDownloadStart();

  try {
    let res = await fetch(url, init);

    // Même singleton refresh que apiFetch
    if (res.status === 401) {
      const refreshed = await _refreshToken();
      if (refreshed) {
        res = await fetch(url, init);
      } else {
        _forceLogout(window.location.pathname);
        throw new Error('Session expirée.');
      }
    }

    if (!res.ok) {
      let msg = `Erreur ${res.status}`;
      try { msg = motifDuRefus(await res.json(), res.status); } catch { /* ignore */ }
      throw new Error(msg);
    }
    return await res.blob();
  } finally {
    markDownloadEnd();
  }
}

/**
 * Même chose qu'`apiFetchBlob`, mais en POST avec un corps JSON.
 *
 * Nécessaire pour les endpoints qui *émettent* un document plutôt que de le
 * servir : la génération crée une ligne au registre (numéro de série, token de
 * vérification), ce qui interdit un GET. Le PDF revient dans la réponse.
 */
export async function apiFetchBlobPost(
  path: string,
  body: unknown = {},
): Promise<Blob> {
  const url = `${API}${path}`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (typeof document !== 'undefined') {
    const csrfMatch = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/);
    if (csrfMatch) headers['X-CSRFToken'] = decodeURIComponent(csrfMatch[1]);
  }
  const init: RequestInit = {
    method: 'POST', credentials: 'include', headers, body: JSON.stringify(body),
  };

  const { markDownloadStart, markDownloadEnd } = await import('./downloadBlob');
  markDownloadStart();

  try {
    let res = await fetch(url, init);

    if (res.status === 401) {
      const refreshed = await _refreshToken();
      if (refreshed) {
        res = await fetch(url, init);
      } else {
        _forceLogout(window.location.pathname);
        throw new Error('Session expirée.');
      }
    }

    if (!res.ok) {
      let msg = `Erreur ${res.status}`;
      // On veut la vraie cause du refus, pas un « Erreur 400 » — mais le seul
      // motif, sans le code ni la référence de log qui l'encadrent.
      try { msg = motifDuRefus(await res.json(), res.status); }
      catch { /* réponse non-JSON : on garde le message générique */ }
      throw new Error(msg);
    }
    return await res.blob();
  } finally {
    markDownloadEnd();
  }
}

/**
 * Même chose qu'`apiFetchBlobPost`, mais rend AUSSI les en-têtes.
 *
 * Une édition par lot renvoie le PDF dans le corps et son bilan — combien de
 * pièces produites, lesquelles ont échoué — dans les en-têtes. Sans eux,
 * l'écran devrait redemander au serveur ce qu'il vient de lui répondre.
 */
export async function apiFetchBlobPostAvecEntetes(
  path: string,
  body: unknown = {},
): Promise<{ blob: Blob; headers: Headers }> {
  const url = `${API}${path}`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (typeof document !== 'undefined') {
    const csrfMatch = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/);
    if (csrfMatch) headers['X-CSRFToken'] = decodeURIComponent(csrfMatch[1]);
  }
  const init: RequestInit = {
    method: 'POST', credentials: 'include', headers, body: JSON.stringify(body),
  };

  const { markDownloadStart, markDownloadEnd } = await import('./downloadBlob');
  markDownloadStart();

  try {
    let res = await fetch(url, init);
    if (res.status === 401) {
      const refreshed = await _refreshToken();
      if (refreshed) {
        res = await fetch(url, init);
      } else {
        _forceLogout(window.location.pathname);
        throw new Error('Session expirée.');
      }
    }
    if (!res.ok) {
      let msg = `Erreur ${res.status}`;
      try { msg = motifDuRefus(await res.json(), res.status); }
      catch { /* réponse non-JSON : on garde le message générique */ }
      throw new Error(msg);
    }
    return { blob: await res.blob(), headers: res.headers };
  } finally {
    markDownloadEnd();
  }
}

/** Normalise les réponses paginées ET les tableaux bruts (compatibilité NoPagination). */
export async function apiFetchPaginated<T>(
  path: string,
  params: Record<string, string | number> = {}
): Promise<PaginatedResponse<T>> {
  const raw = await apiFetch<PaginatedResponse<T> | T[]>(path, { params });
  if (Array.isArray(raw)) {
    return { results: raw, count: raw.length, pages: 1, next: null, previous: null };
  }
  return raw;
}
