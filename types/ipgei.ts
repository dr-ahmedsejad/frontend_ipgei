/**
 * Types du moteur académique IPGEI (MPSI → MP).
 *
 * Miroir des serializers de `apps/ipgei` côté backend. Ces types sont la source
 * unique pour le module : ne pas les redéclarer localement dans les pages.
 */

// ── Vocabulaire du cursus ────────────────────────────────────────────────────
export type NiveauIPGEI    = 'MPSI' | 'MP';
export type CodeSemestre   = 'S1' | 'S2' | 'S3' | 'S4';
export type TypeSemestre   = 'I' | 'P';
export type TypeSeance     = 'cours' | 'td' | 'tp' | 'ds';
export type TypeSemaine    = 'cours' | 'examen' | 'vacances' | 'ferie';

export const NIVEAUX: { value: NiveauIPGEI; label: string }[] = [
  { value: 'MPSI', label: 'MPSI — 1re année' },
  { value: 'MP',   label: 'MP — 2e année' },
];

export const CODES_SEMESTRE: { value: CodeSemestre; label: string; niveau: NiveauIPGEI }[] = [
  { value: 'S1', label: 'S1 — MPSI', niveau: 'MPSI' },
  { value: 'S2', label: 'S2 — MPSI', niveau: 'MPSI' },
  { value: 'S3', label: 'S3 — MP',   niveau: 'MP' },
  { value: 'S4', label: 'S4 — MP',   niveau: 'MP' },
];

export const TYPES_SEANCE: { value: TypeSeance; label: string }[] = [
  { value: 'cours', label: 'Cours' },
  { value: 'td',    label: 'TD' },
  { value: 'tp',    label: 'TP' },
  { value: 'ds',    label: 'Devoir surveillé' },
];

/** Niveau auquel appartient un semestre — S1/S2 en MPSI, S3/S4 en MP. */
export function niveauDuSemestre(code: CodeSemestre): NiveauIPGEI {
  return code === 'S1' || code === 'S2' ? 'MPSI' : 'MP';
}

// ── Paramètres ───────────────────────────────────────────────────────────────
export interface ParametresIPGEI {
  id:                     number;
  institution:            number;
  seuil_validation:       string;
  plafond_rattrapage:     string | null;
  nb_semaines_defaut:     number;
  droit_redoublement_max: number;
}

// ── Calendrier ───────────────────────────────────────────────────────────────
export interface SemestreIPGEI {
  id:                   number;
  institution:          number | null;
  code:                 CodeSemestre;
  annee_universitaire:  string;
  date_debut:           string;
  date_fin:             string;
  nb_semaines:          number;
  est_cloture:          boolean;
  niveau:               NiveauIPGEI;
  type_semestre:        TypeSemestre;
  nb_semaines_generees: number;
}

/** Rapport entre l'emploi du temps d'une semaine et le suivi qui en a été tiré. */
export type EtatCoherence = 'previsionnel' | 'aligne' | 'divergent';

export interface SemaineIPGEI {
  id:            number;
  semestre:      number;
  semestre_code: CodeSemestre;
  numero:        number | null;
  date_debut:    string;
  date_fin:      string;
  type_semaine:  TypeSemaine;
  description:   string;
  /** `null` tant que le suivi de la semaine n'a jamais été généré. */
  suivi_genere_le:   string | null;
  etat_coherence:    EtatCoherence;
  libelle_coherence: string;
}

// ── Matières ─────────────────────────────────────────────────────────────────
export interface Matiere {
  id:             number;
  institution:    number | null;
  code:           string;
  intitule:       string;
  intitule_ar:    string;
  code_semestre:  CodeSemestre;
  niveau:         NiveauIPGEI;
  coefficient:    string;
  volume_cm:      number;
  volume_td:      number;
  volume_tp:      number;
  /** Total calculé côté serveur : CM + TD + TP. Jamais saisi. */
  volume_horaire: number;
  has_tp:         boolean;
  pct_ds:         string;
  pct_tp:         string;
  pct_exam:       string;
  ordre:          number;
  actif:          boolean;
}

export interface MatiereSelect {
  id:            number;
  code:          string;
  intitule:      string;
  code_semestre: CodeSemestre;
  coefficient:   string;
  has_tp:        boolean;
  volume_cm:     number;
  volume_td:     number;
  volume_tp:     number;
}

export type MatiereInput = Partial<Omit<Matiere, 'id' | 'niveau' | 'volume_horaire'>>;

// ── Classes & sous-groupes ───────────────────────────────────────────────────
export interface SousGroupeTP {
  id:              number;
  classe:          number;
  classe_nom:      string;
  libelle:         string;
  matieres:        number[];
  matieres_detail: MatiereSelect[];
  effectif:        number;
}

export interface Classe {
  id:                       number;
  institution:              number | null;
  niveau:                   NiveauIPGEI;
  libelle:                  string;
  nom:                      string;
  annee_universitaire:      string;
  capacite:                 number | null;
  professeur_principal:     number | null;
  professeur_principal_nom: string;
  actif:                    boolean;
  effectif:                 number;
  sous_groupes:             SousGroupeTP[];
  date_creation:            string;
}

export interface ClasseSelect {
  id:                  number;
  nom:                 string;
  niveau:              NiveauIPGEI;
  libelle:             string;
  annee_universitaire: string;
}

export type ClasseInput = {
  niveau:               NiveauIPGEI;
  libelle:              string;
  annee_universitaire:  string;
  capacite?:            number | null;
  professeur_principal?: number | null;
  actif?:               boolean;
};

// ── Inscriptions ─────────────────────────────────────────────────────────────
export type StatutInscription =
  | 'actif' | 'admis' | 'reoriente' | 'redoublant' | 'autorise_cnim' | 'abandon';

export interface Inscription {
  id:                   number;
  etudiant:             number;
  etudiant_nom:         string;
  etudiant_matricule:   string;
  classe:               number;
  classe_nom:           string;
  sous_groupe:          number | null;
  sous_groupe_libelle:  string;
  annee_universitaire:  string;
  numero_ordre:         number | null;
  niveau:               NiveauIPGEI;
  statut:               StatutInscription;
  statut_display:       string;
  nb_redoublements:     number;
  date_inscription:     string;
  actif:                boolean;
}

/** Identité saisie lors de l'inscription d'un étudiant encore inconnu. */
export interface NouvelEtudiant {
  matricule:          string;
  nom:                string;
  prenom_fr?:         string;
  nom_ar?:            string;
  genre?:             'M' | 'F';
  date_naissance?:    string | null;
  lieu_naissance_fr?: string;
  cni?:               string | null;
  telephone?:         string;
  email?:             string;
  nbac?:              string | null;
  serie_bac?:         string;
  moyenne_bac?:       string | null;
}

/**
 * Inscription en une passe : soit `etudiant` (déjà au référentiel), soit
 * `nouvel_etudiant` (créé et rattaché dans la même transaction) — jamais les deux.
 */
export interface InscriptionComplete {
  etudiant?:        number | null;
  nouvel_etudiant?: NouvelEtudiant;
  classe:           number;
  sous_groupe?:     number | null;
  numero_ordre?:    number | null;
}

export interface HistoriqueClasse {
  id:               number;
  inscription:      number;
  classe_avant:     number;
  classe_avant_nom: string;
  classe_apres:     number;
  classe_apres_nom: string;
  motif:            string;
  decide_par:       number | null;
  decide_par_nom:   string;
  date_effet:       string;
}

// ── Notes ────────────────────────────────────────────────────────────────────
export type TypeEvaluation = 'ds' | 'exam';

export interface Evaluation {
  id:              number;
  note:            number;
  type_evaluation: TypeEvaluation;
  numero:          number;
  valeur:          string;
  date_evaluation: string | null;
  saisie_par:      number | null;
  date_saisie:     string;
}

export interface Note {
  id:                  number;
  inscription:         number;
  matiere:             number;
  semestre:            number;
  matiere_code:        string;
  matiere_intitule:    string;
  matiere_has_tp:      boolean;
  matiere_coefficient: string;
  etudiant_nom:        string;
  etudiant_matricule:  string;
  semestre_code:       CodeSemestre;
  note_tp:             string | null;
  note_rattrapage:     string | null;
  moy_ds:              string | null;
  moy_exam:            string | null;
  moyenne:             string | null;
  note_retenue:        string | null;
  /** Pondération figée au calcul — ne suit PAS un changement ultérieur de la matière. */
  pct_ds:              string | null;
  pct_tp:              string | null;
  pct_exam:            string | null;
  coefficient:         string | null;
  plafond_rattrapage_applique: string | null;
  verrouillee:         boolean;
  date_calcul:         string | null;
  evaluations:         Evaluation[];
}

/** Grille de saisie d'une matière pour toute une classe. */
export interface GrilleNotes {
  matiere:     Matiere;
  semestre:    SemestreIPGEI;
  nb_ds:       number;
  nb_examens:  number;
  verrouillee: boolean;
  notes:       Note[];
}

export interface SaisieEvaluation {
  type_evaluation: TypeEvaluation;
  numero:          number;
  /** `null` supprime l'évaluation existante. */
  valeur:          string | null;
}

export interface SaisieLigneNote {
  inscription:      number;
  note_tp?:         string | null;
  note_rattrapage?: string | null;
  evaluations?:     SaisieEvaluation[];
}

export interface SaisieCollective {
  classe:   number;
  matiere:  number;
  semestre: number;
  lignes:   SaisieLigneNote[];
}

// ── Délibération ─────────────────────────────────────────────────────────────
export type PorteeDeliberation = 'semestre' | 'annuelle';
export type StatutDeliberation = 'brouillon' | 'calculee' | 'validee';
export type DecisionJury =
  | 'admis' | 'reoriente' | 'autorise_cnim' | 'redoublant' | 'exclu' | '';

export const DECISIONS_PAR_NIVEAU: Record<NiveauIPGEI, { value: DecisionJury; label: string }[]> = {
  MPSI: [
    { value: 'admis',      label: 'Admis en 2e année' },
    { value: 'reoriente',  label: 'Réorienté' },
  ],
  MP: [
    { value: 'autorise_cnim', label: 'Autorisé à concourir (CNIM)' },
    { value: 'redoublant',    label: 'Redoublant' },
    { value: 'exclu',         label: 'Exclu — droit de redoublement épuisé' },
  ],
};

export interface Deliberation {
  id:                  number;
  institution:         number | null;
  libelle:             string;
  niveau:              NiveauIPGEI;
  annee_universitaire: string;
  portee:              PorteeDeliberation;
  semestre:            number | null;
  semestre_code:       string;
  seuil_validation:    string;
  plafond_rattrapage:  string | null;
  statut:              StatutDeliberation;
  statut_display:      string;
  est_verrouillee:     boolean;
  observations:        string;
  date_creation:       string;
  date_calcul:         string | null;
  date_validation:     string | null;
  validee_par:         number | null;
  validee_par_nom:     string;
  nb_lignes:           number;
}

export interface DetailLigneDeliberation {
  id:               number;
  matiere:          number;
  matiere_code:     string;
  matiere_intitule: string;
  semestre:         number;
  semestre_code:    CodeSemestre;
  note_retenue:     string | null;
  coefficient:      string;
}

export interface LigneDeliberation {
  id:                    number;
  deliberation:          number;
  inscription:           number;
  etudiant_nom:          string;
  etudiant_matricule:    string;
  classe_nom:            string;
  moyenne_generale:      string | null;
  total_coefficients:    string | null;
  rang:                  number | null;
  decision_auto:         DecisionJury;
  decision_auto_display: string;
  decision:              DecisionJury;
  decision_display:      string;
  est_ajustee:           boolean;
  motif_ajustement:      string;
  observations:          string;
  nb_redoublements:      number;
  details?:              DetailLigneDeliberation[];
}

export interface StatistiquesDeliberation {
  effectif:      number;
  notes_saisies: number;
  moyenne_promo: string | null;
  meilleure:     string | null;
  plus_faible:   string | null;
  repartition:   Record<string, number>;
}

// ── EDT ──────────────────────────────────────────────────────────────────────
export interface SeanceType {
  id:                  number;
  grille:              number;
  jour:                number;
  jour_libelle:        string;
  creneau:             number;
  creneau_libelle:     string;
  matiere:             number;
  matiere_code:        string;
  prof:                number | null;
  prof_nom:            string;
  salle:               number | null;
  salle_nom:           string;
  sous_groupe:         number | null;
  sous_groupe_libelle: string;
  /** Identifiant dans « Paramètres → Séances » — référentiel commun au socle. */
  type_seance:         number;
  type_seance_libelle: string;
  /** Sport, instruction militaire… : ni enseignant ni salle. */
  type_seance_special: boolean;
}

export interface GrilleType {
  id:            number;
  classe:        number;
  classe_nom:    string;
  type_semestre: TypeSemestre;
  libelle:       string;
  actif:         boolean;
  nb_seances:    number;
  seances?:      SeanceType[];
  date_creation: string;
}

export type OrigineSeance = 'grille' | 'manuelle' | 'permutation';

export interface SeanceReelle {
  id:                  number;
  classe:              number;
  classe_nom:          string;
  semaine:             number;
  semaine_numero:      number | null;
  jour:                number;
  jour_libelle:        string;
  creneau:             number;
  creneau_libelle:     string;
  creneau_ordre:       number;
  matiere:             number;
  matiere_code:        string;
  matiere_intitule:    string;
  prof:                number | null;
  prof_nom:            string;
  prof_initial:        number | null;
  prof_initial_nom:    string;
  salle:               number | null;
  salle_nom:           string;
  sous_groupe:         number | null;
  sous_groupe_libelle: string;
  /** Identifiant dans « Paramètres → Séances » — référentiel commun au socle. */
  type_seance:         number;
  type_seance_libelle: string;
  /** Sport, instruction militaire… : ni enseignant ni salle. */
  type_seance_special: boolean;
  date:                string | null;
  origine:             OrigineSeance;
  annulee:             boolean;
  observations:        string;
}

export interface ResultatDuplication {
  creees:            number;
  ignorees:          number;
  remplacees:        number;
  semaines_traitees: number;
}

// ── Permutations ─────────────────────────────────────────────────────────────
export type StatutPermutation =
  | 'demandee' | 'accordee' | 'validee' | 'appliquee' | 'refusee';

export interface PermutationProf {
  id:                number;
  seance_a:          number;
  seance_b:          number;
  seance_a_detail:   SeanceReelle;
  seance_b_detail:   SeanceReelle;
  nb_semaines:       number;
  statut:            StatutPermutation;
  statut_display:    string;
  action_directe:    boolean;
  motif:             string;
  motif_refus:       string;
  demande_par:       number | null;
  demande_par_nom:   string;
  accord_par:        number | null;
  valide_par:        number | null;
  valide_par_nom:    string;
  seances_impactees: number;
  date_demande:      string;
  date_accord:       string | null;
  date_validation:   string | null;
  date_application:  string | null;
}

export interface PermutationEtudiant {
  id:                 number;
  inscription:        number;
  etudiant_nom:       string;
  etudiant_matricule: string;
  classe_source:      number;
  classe_source_nom:  string;
  classe_cible:       number;
  classe_cible_nom:   string;
  sous_groupe_cible:  number | null;
  statut:             StatutPermutation;
  statut_display:     string;
  action_directe:     boolean;
  motif:              string;
  motif_refus:        string;
  demande_par:        number | null;
  demande_par_nom:    string;
  accord_par:         number | null;
  valide_par:         number | null;
  date_demande:       string;
  date_accord:        string | null;
  date_validation:    string | null;
  date_application:   string | null;
}

// ── Absences ─────────────────────────────────────────────────────────────────
export type StatutAbsence = 'absent' | 'retard' | 'justifiee';

export const STATUTS_ABSENCE: { value: StatutAbsence; label: string }[] = [
  { value: 'absent',    label: 'Absent' },
  { value: 'retard',    label: 'Retard' },
  { value: 'justifiee', label: 'Absence justifiée' },
];

export interface AbsenceSeance {
  id:                 number;
  seance:             number;
  inscription:        number;
  etudiant_nom:       string;
  etudiant_matricule: string;
  statut:             StatutAbsence;
  statut_display:     string;
  justificatif:       string;
  matiere_code:       string;
  date_seance:        string | null;
  creneau_libelle:    string;
  saisie_par:         number | null;
  date_saisie:        string;
}

export interface FeuilleAppel {
  seance:  SeanceReelle;
  classe:  Inscription[];
  absents: AbsenceSeance[];
}

export interface BilanAbsences {
  absences:   number;
  retards:    number;
  justifiees: number;
  total:      number;
}

// ── Relevés ──────────────────────────────────────────────────────────────────
export interface ReleveSemestre {
  etudiant:            { id: number; nom: string; matricule: string };
  classe:              string;
  semestre:            CodeSemestre;
  annee_universitaire: string;
  notes:               Note[];
  moyenne:             string | null;
  total_coefficients:  string | null;
  seuil:               string;
  valide:              boolean;
  absences:            BilanAbsences;
}

export interface ReleveAnnuel {
  etudiant:            { id: number; nom: string; matricule: string };
  classe:              string;
  annee_universitaire: string;
  semestres:           { code: CodeSemestre; moyenne: string | null; notes: Note[] }[];
  moyenne:             string | null;
  total_coefficients:  string | null;
  seuil:               string;
  valide:              boolean;
  absences:            BilanAbsences;
}

// ── Documents ────────────────────────────────────────────────────────────────
export type TypeDocumentIPGEI =
  | 'ipgei_releve_semestre'
  | 'ipgei_releve_annuel'
  | 'ipgei_decision_deliberation'
  | 'ipgei_attestation_cnim';

export interface DocumentIPGEI {
  id:                  number;
  numero_serie:        string;
  type_document:       TypeDocumentIPGEI;
  type_libelle:        string;
  etudiant:            number;
  etudiant_nom:        string;
  etudiant_matricule:  string;
  annee_universitaire: string;
  est_valide:          boolean;
  date_generation:     string;
  premiere_generation: string | null;
  genere_par:          number | null;
  genere_par_nom:      string;
  a_pdf:               boolean;
}

// ── Tableau de bord ──────────────────────────────────────────────────────────
export interface ResumeIPGEI {
  annee_universitaire: string;
  classes:   { total: number; mpsi: number; mp: number };
  effectifs: { total: number; mpsi: number; mp: number };
  matieres:      number;
  semestres:     number;
  deliberations: number;
  permutations_en_attente: number;
}

/**
 * Une case déjà prise ailleurs : de quoi retirer un enseignant ou une salle des
 * listes de choix, et dire où ils sont retenus.
 */
export interface OccupationCreneau {
  jour:    number;
  creneau: number;
  prof:    number | null;
  salle:   number | null;
  /** Classe (et sous-groupe) qui les mobilise. */
  classe:  string;
}

/**
 * Une séance figée. Volontairement au format d'une séance vivante : l'écran
 * d'historique réutilise le composant de consultation de l'emploi du temps,
 * sans quoi l'archive s'afficherait autrement que l'original — et ne
 * permettrait plus la comparaison qui est sa seule raison d'être.
 */
export interface SeanceArchivee {
  id:                  number;
  jour:                number | null;
  creneau:             number | null;
  matiere:             number | null;
  type_seance:         number | null;
  sous_groupe:         number | null;
  matiere_code:        string;
  matiere_intitule:    string;
  type_seance_libelle: string;
  type_seance_special: boolean;
  prof_nom:            string;
  prof_initial_nom:    string;
  salle_nom:           string;
  classe_nom:          string;
  sous_groupe_libelle: string;
  annulee:             boolean;
  origine:             string;
  date_seance:         string | null;
  version:             number;
  genere_le:           string;
}

/** Une prise de vue disponible : quelle semaine, quelle version, quand. */
export interface VersionArchive {
  semaine:    number;
  numero:     number;
  date_debut: string | null;
  date_fin:   string | null;
  semestre:   string;
  version:    number;
  genere_le:  string;
  nb_seances: number;
}
