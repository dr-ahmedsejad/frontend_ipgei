import { apiFetch } from '@/lib/api';

// ── Vue de surveillance ──────────────────────────────────────────────────────
//
// Toutes les classes de l'année et leurs sous-groupes de TP sur une journée,
// pour ceux qui veillent sur les étudiants. Source : l'emploi du temps vivant
// (`SeanceReelle`) et les épreuves. Module RBAC « surveillance » : DA et AA par
// défaut. Backend : apps/ipgei/surveillance.py.

const BASE = '/api/v1/ipgei/surveillance';

export interface SousGroupeEnTP {
  groupe:  string;
  salle:   string;
  type:    string;
  em_code: string;
  prof:    string;
}

export interface CaseSurveillance {
  seance:      number | null;
  epreuve:     number | null;
  /** La ligne de suivi : la saisie des absences s'ouvre sur elle. */
  suivi:       number | null;
  em_code:     string;
  em_intitule: string;
  type:        string;
  special:     boolean;
  /** Devoir ou examen — au planning ou au calendrier des épreuves. */
  evaluation:  boolean;
  /** Heure réelle d'une épreuve (« 08h00-11h00 »), qui déborde du créneau. */
  horaire:     string;
  prof:        string;
  salle:       string;
  /** Séance annulée : le groupe est libre. */
  annulee:     boolean;
  /** Sur la ligne d'un sous-groupe : la séance est celle de sa classe. */
  herite:      boolean;
  /** Sur la ligne d'une classe : elle est éclatée en sous-groupes de TP. */
  dedouble:    boolean;
  sous_groupes: SousGroupeEnTP[];
  /** Même cours, même salle : les groupes sont ensemble. */
  reunis:      string[];
  /** Même cours, autre salle : en même temps, ailleurs. */
  paralleles:  { groupe: string; salle: string }[];
  /** Deux séances posées sur la même case : seule la première est montrée. */
  doublon:     boolean;
  /** L'utilisateur peut ouvrir la saisie des absences de cette séance — mêmes
      règles que l'écran de saisie (droits, institution principale, groupes
      délégués) ; jamais pour une journée à venir. */
  pointable:   boolean;
  /** Pour qui a les droits de saisie : pourquoi la case ne s'ouvre pas. */
  motif:       string;
}

export interface GroupeSurveillance {
  id:             number;
  nom:            string;
  libelle:        string;
  sous_groupe:    boolean;
  /** La classe de rattachement (elle-même pour une classe). */
  classe:         number;
  niveau:         string;
  niveau_libelle: string;
}

export interface JourneeSurveillance {
  annee:              string;
  date:               string;
  date_fr:            string;
  jour:               string;
  dans_le_calendrier: boolean;
  numero_semaine:     number | null;
  type_semestre:      string;
  type_semaine:       string;
  a_venir:            boolean;
  droits_saisie:      boolean;
  creneaux:           { id: number; libelle: string; inactif: boolean }[];
  groupes:            GroupeSurveillance[];
  /** Clé « <groupe>:<créneau> ». */
  cases:              Record<string, CaseSurveillance>;
}

export const surveillanceApi = {
  journee: (annee: string, date: string) =>
    apiFetch<JourneeSurveillance>(
      `${BASE}/?annee_universitaire=${encodeURIComponent(annee)}&date=${date}`),

  pdfChemin: `${BASE}/pdf/`,
  /** Paramètres du PDF : la journée, ou la semaine (une page par jour). */
  pdfJournee: (annee: string, date: string) =>
    ({ annee_universitaire: annee, date }),
  pdfSemaine: (annee: string, typeSemestre: string, numero: number) =>
    ({ annee_universitaire: annee, type_semestre: typeSemestre, numero_semaine: String(numero) }),
};
