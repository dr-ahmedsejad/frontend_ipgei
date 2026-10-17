/**
 * Le Mode salle : choisir la séance, faire l'appel, enchaîner.
 *
 * Porté de l'ISS le 17/10/2026 (frontend_iss 7924fea). Les jours étaient des
 * boutons muets — ni date, ni nombre de séances —, rien ne disait combien
 * d'appels restaient à faire, et l'écran quittait la séance deux secondes
 * après l'appel validé. Ces règles fixent ce que les deux écrans montrent.
 *
 * Fichier sans dépendance (ni enum, ni import d'exécution) : `node --test`
 * le lit tel quel (`lib/salle-appel.test.mjs`).
 */

/* Les statuts de présence — les valeurs de `StatutPresence` (types/absences). */
export const PRESENT = 0;
export const ABSENT = 1;
export const SANCTIONNE = 2;
export const JUSTIFIEE = 3;

export interface SeanceDuJour {
  jour_label: string | null;
  date_suivie?: string | null;
  appel?: { saisi: boolean } | null;
}

export interface BilanJour {
  /** La date de la journée (AAAA-MM-JJ), lue sur ses séances. */
  date: string | null;
  seances: number;
  /** Combien ont déjà eu leur appel. */
  faits: number;
}

/** Les séances de la semaine, comptées par jour. */
export function bilanParJour(seances: readonly SeanceDuJour[]): Map<string, BilanJour> {
  const m = new Map<string, BilanJour>();
  for (const s of seances) {
    if (!s.jour_label) continue;
    const b = m.get(s.jour_label) ?? { date: s.date_suivie ?? null, seances: 0, faits: 0 };
    b.seances += 1;
    if (s.appel?.saisi) b.faits += 1;
    if (!b.date && s.date_suivie) b.date = s.date_suivie;
    m.set(s.jour_label, b);
  }
  return m;
}

/**
 * Le jour à proposer : le jour choisi s'il a des séances, sinon AUJOURD'HUI
 * s'il en a, sinon le premier jour qui en a. Une journée vide ne se propose
 * jamais : on ouvrirait l'écran sur « aucune séance ».
 */
export function jourAProposer(
  jours: readonly string[], parJour: Map<string, BilanJour>,
  choisi: string | null, aujourdhui: string,
): string | null {
  const aCours = (j: string | null) => !!j && (parJour.get(j)?.seances ?? 0) > 0;
  if (aCours(choisi)) return choisi;
  const duJour = [...parJour.entries()].find(([, b]) => b.date === aujourdhui);
  if (duJour) return duJour[0];
  return jours.find(j => aCours(j)) ?? null;
}

/** « 05/10 – 10/10 » : une semaine se reconnaît à ses dates. */
export function libelleDates(dates?: { debut: string; fin: string } | null): string {
  if (!dates) return '';
  const court = (iso: string) => {
    const [, m, d] = iso.split('-');
    return d && m ? `${d}/${m}` : iso;
  };
  return `${court(dates.debut)} – ${court(dates.fin)}`;
}

/** La date du jour au format des séances (AAAA-MM-JJ), en heure locale. */
export function aujourdhuiIso(maintenant: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${maintenant.getFullYear()}-${p(maintenant.getMonth() + 1)}-${p(maintenant.getDate())}`;
}

export interface BilanAppel {
  presents: number; absents: number; sanctions: number; justifiees: number;
}

/** « 1 présent », « 4 présents » : le mot entier, accordé. */
function compte(n: number, mot: string): string {
  return `${n} ${mot}${n > 1 ? 's' : ''}`;
}

/**
 * Le bilan d'un appel, en toutes lettres : « 4 présents · 1 absent ».
 *
 * Présents, absents et sanctionnés sont TOUJOURS dits — un statut qui
 * disparaît à zéro passe pour inexistant. Les justifiés, qui ne se saisissent
 * pas à l'appel, seulement s'il y en a.
 */
export function libelleBilan(b: BilanAppel): string {
  const parties = [compte(b.presents, 'présent'), compte(b.absents, 'absent'),
                   compte(b.sanctions, 'sanctionné')];
  if (b.justifiees > 0) parties.push(compte(b.justifiees, 'justifié'));
  return parties.join(' · ');
}

/* ─── L'appel ────────────────────────────────────────────────────────────── */

/** Sanctionner, c'est requalifier une absence : les rôles du cycle complet
 *  de « Marquer les absences ». Les autres font l'appel Présent ↔ Absent. */
const ROLES_SANCTION = ['admin', 'DA', 'DE', 'scolarite'];

export function peutSanctionner(role: string | null | undefined): boolean {
  return ROLES_SANCTION.includes(role ?? '');
}

/**
 * Un statut qu'on ne change pas d'une touche : la JUSTIFIÉE, pour tous — elle
 * se gère dans « Justificatifs », avec sa pièce ; la SANCTION, pour qui ne
 * peut pas sanctionner — la direction l'a requalifiée, l'appel ne la défait
 * pas.
 */
export function estVerrouille(statut: number, sanctionne: boolean): boolean {
  return statut === JUSTIFIEE || (statut === SANCTIONNE && !sanctionne);
}

/** Le statut suivant d'une touche : P → A (→ S) → P. */
export function statutSuivant(statut: number, sanctionne: boolean): number {
  if (estVerrouille(statut, sanctionne)) return statut;
  const cycle = sanctionne ? [PRESENT, ABSENT, SANCTIONNE] : [PRESENT, ABSENT];
  const i = cycle.indexOf(statut);
  return cycle[(i + 1) % cycle.length];
}

export interface PresenceEnregistree { statut: number; commentaire?: string }

/**
 * Ce qui part au serveur : ce qui CHANGE, ou n'a pas encore de ligne. Le
 * commentaire déjà saisi est renvoyé tel quel — un motif posé ailleurs
 * (« Émargement de l'épreuve », une note de la scolarité) ne s'efface pas
 * parce qu'on a fait l'appel (17/10/2026).
 */
export function presencesAEnvoyer(
  etudiants: readonly { id: number }[],
  statuts: Map<number, number>,
  deja: Record<string, PresenceEnregistree>,
): { etudiant_id: number; statut: number; commentaire: string }[] {
  return etudiants
    .filter(e => {
      const avant = deja[String(e.id)];
      return !avant || avant.statut !== (statuts.get(e.id) ?? PRESENT);
    })
    .map(e => ({
      etudiant_id: e.id,
      statut: statuts.get(e.id) ?? PRESENT,
      commentaire: deja[String(e.id)]?.commentaire ?? '',
    }));
}

/** La séance d'après, le même jour, dans l'ordre de la semaine — ou null. */
export function seanceSuivante<T extends { id: number; jour_label: string | null }>(
  seances: readonly T[], id: number, jour: string | null,
): T | null {
  const duJour = seances.filter(s => s.jour_label === jour);
  const i = duJour.findIndex(s => s.id === id);
  return i >= 0 ? duJour[i + 1] ?? null : null;
}

/** L'adresse de l'appel d'une séance, en gardant le chemin de retour (la vue
 *  de surveillance) : « Séance suivante » ne doit pas le perdre. */
export function lienAppel(seanceId: number, retour?: string | null): string {
  const base = `/dashboard/absences/saisir/salle/${seanceId}`;
  return retour ? `${base}?retour=${encodeURIComponent(retour)}` : base;
}

/* ─── Le dernier choix ───────────────────────────────────────────────────── */

/* La classe, la semaine et le jour : on revient d'un appel sur la même
   journée, au lieu de tout resélectionner. Mémoire de l'ONGLET — une
   préférence d'écran ; sans stockage (navigation privée), l'écran marche. */
const CLE_MEMOIRE = 'absences-salle-choix';

export interface ChoixSalle { dep: string; semaine: string; jour: string }

export function lireChoix(): Partial<ChoixSalle> {
  try {
    const v = JSON.parse(sessionStorage.getItem(CLE_MEMOIRE) || '{}');
    return v && typeof v === 'object' ? v : {};
  } catch { return {}; }
}

export function garderChoix(c: ChoixSalle): void {
  try { sessionStorage.setItem(CLE_MEMOIRE, JSON.stringify(c)); } catch { /* sans mémoire */ }
}
