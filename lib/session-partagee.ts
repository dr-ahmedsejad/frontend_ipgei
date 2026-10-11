/**
 * La session est PARTAGÉE entre les onglets : on travaille souvent avec le Plan,
 * la saisie et la consultation ouverts côte à côte. Deux défauts déconnectaient
 * en plein travail (recette du 11/10/2026) :
 *
 * 1. L'INACTIVITÉ se comptait onglet par onglet. Un onglet oublié en
 *    arrière-plan atteignait ses 20 minutes, déconnectait la session et
 *    prévenait les autres — y compris celui où l'on tapait. L'activité est
 *    désormais notée pour tous les onglets : la session n'est inactive que si
 *    AUCUN onglet n'a servi depuis 20 minutes.
 *
 * 2. Le RENOUVELLEMENT du jeton n'était coordonné ni entre onglets ni entre les
 *    deux chemins qui le déclenchent (intervalle de 55 min, et 401 d'une
 *    requête). Le serveur annule l'ancien jeton à chaque renouvellement
 *    (rotation + liste noire) : le second renouvellement simultané présentait un
 *    jeton déjà annulé, recevait un refus, et l'onglet déconnectait tout le monde.
 *    Un seul renouvellement à la fois pour tout le navigateur (verrou Web
 *    Locks) ; celui qui arrive juste après un autre réutilise son résultat.
 */

const CLE_ACTIVITE = 'siga_derniere_activite';
const CLE_RENOUVELLEMENT = 'siga_renouvele_le';
/** Un renouvellement plus récent que ceci, fait par un autre onglet, suffit. */
const FRAICHEUR_MS = 20_000;

function lireNombre(cle: string): number {
  try { return Number(localStorage.getItem(cle)) || 0; } catch { return 0; }
}

function ecrire(cle: string, valeur: number): void {
  try { localStorage.setItem(cle, String(valeur)); } catch { /* navigation privée, quota : sans effet */ }
}

// ── Activité ─────────────────────────────────────────────────────────────────
let derniereEcriture = 0;

/** L'utilisateur agit dans CET onglet : on le note pour tous (au plus toutes les 5 s). */
export function noterActivite(): void {
  const maintenant = Date.now();
  if (maintenant - derniereEcriture < 5_000) return;
  derniereEcriture = maintenant;
  ecrire(CLE_ACTIVITE, maintenant);
}

/** Dernière activité, tous onglets confondus (0 si inconnue). */
export function derniereActivite(): number {
  return lireNombre(CLE_ACTIVITE);
}

/** La clé de stockage de l'activité, pour écouter les autres onglets. */
export const CLE_STOCKAGE_ACTIVITE = CLE_ACTIVITE;

// ── Renouvellement du jeton ──────────────────────────────────────────────────
async function renouveler(url: string): Promise<boolean> {
  // Un autre onglet vient de le faire : les cookies sont déjà neufs.
  if (Date.now() - lireNombre(CLE_RENOUVELLEMENT) < FRAICHEUR_MS) return true;
  try {
    const res = await fetch(url, { method: 'POST', credentials: 'include' });
    if (res.ok) ecrire(CLE_RENOUVELLEMENT, Date.now());
    return res.ok;
  } catch {
    return false;
  }
}

let enCours: Promise<boolean> | null = null;

/**
 * Renouvelle le jeton d'accès — un seul à la fois dans tout le navigateur.
 * `url` : l'adresse complète de `/api/v1/auth/token/refresh/`.
 */
export function rafraichirSession(url: string): Promise<boolean> {
  if (enCours) return enCours;
  const verrous = typeof navigator !== 'undefined'
    ? (navigator as Navigator & { locks?: LockManager }).locks
    : undefined;
  const p: Promise<boolean> = verrous
    ? (verrous.request('siga-renouvellement-session', () => renouveler(url)) as Promise<unknown> as Promise<boolean>)
    : renouveler(url);
  const suivi = p.finally(() => { enCours = null; });
  enCours = suivi;
  return suivi;
}
