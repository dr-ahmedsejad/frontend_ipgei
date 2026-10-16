/**
 * Les erreurs rendues par le serveur, lues une fois pour tous les écrans.
 * Module pur (aucune dépendance) : lib/api.ts l'utilise, et
 * lib/erreurs-api.test.ts le teste avec `node --test`.
 */

// ── Erreurs du serveur ───────────────────────────────────────────────────────
//
// Le serveur enveloppe ses erreurs (core/exceptions.py) :
//   400 : {"status": 400, "errors": {champ: [msg, …]}, "request_id": …}
//   4xx/5xx : {"status": …, "error": "message", "request_id": …}
// On lisait `error`, `detail` et `non_field_errors` À LA RACINE, puis tout le
// corps en texte : une erreur de validation s'affichait donc en JSON brut
// (`{"status":400,"errors":{…}}`) dans tous les formulaires qui montrent
// `e.message`, et les écrans qui décodaient ce JSON lisaient « status : 400 »
// (16/10/2026). Désormais `message` se lit tel quel, et `champs` garde les
// erreurs par champ pour les formulaires qui marquent le champ fautif.

/** Une erreur rendue par le serveur : `message` lisible, `champs` par champ. */
export class ErreurApi extends Error {
  readonly status: number;
  readonly champs: Record<string, string[]> | null;

  constructor(message: string, status: number, champs: Record<string, string[]> | null) {
    super(message);
    this.name = 'ErreurApi';
    this.status = status;
    this.champs = champs;
  }
}

function texte(v: unknown): string {
  return typeof v === 'string' ? v : JSON.stringify(v);
}

/** Les erreurs par champ d'un corps de réponse — l'enveloppe `errors`, ou
 *  l'ancien format {champ: [msg]} d'une vue qui répond elle-même — sinon null. */
export function champsDeLaReponse(data: unknown): Record<string, string[]> | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const d = data as Record<string, unknown>;
  let source: unknown;
  if (d.errors && typeof d.errors === 'object') source = d.errors;
  else if ('error' in d || 'detail' in d) return null;
  else source = d;
  if (Array.isArray(source)) return { non_field_errors: source.map(texte) };
  const out: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(source as Record<string, unknown>)) {
    if (k === 'status' || k === 'request_id') continue;
    out[k] = Array.isArray(v) ? v.map(texte) : [texte(v)];
  }
  return Object.keys(out).length ? out : null;
}

/** Les erreurs par champ en une phrase : l'erreur générale si elle existe,
 *  sinon « champ : message » pour chaque champ. */
export function phraseDesChamps(champs: Record<string, string[]>): string {
  const generales = [...(champs.non_field_errors ?? []), ...(champs.detail ?? [])];
  if (generales.length) return generales.join(' ');
  return Object.entries(champs).map(([k, v]) => `${k} : ${v.join(' ')}`).join(' — ');
}

/** Le message lisible et les erreurs par champ d'une réponse en échec. */
export function lireErreur(
  data: unknown, status: number, defaut?: string,
): { msg: string; champs: Record<string, string[]> | null } {
  const d = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  const champs = champsDeLaReponse(data);
  const msg =
    (typeof d.error === 'string' && d.error) ||
    (typeof d.detail === 'string' && d.detail) ||
    (champs ? phraseDesChamps(champs) : '') ||
    (typeof d.message === 'string' && d.message) ||
    defaut ||
    `Erreur ${status}`;
  return { msg, champs };
}

/** Les erreurs par champ d'une erreur levée par apiFetch, ou null. */
export function champsErreur(e: unknown): Record<string, string[]> | null {
  return e instanceof ErreurApi ? e.champs : null;
}
