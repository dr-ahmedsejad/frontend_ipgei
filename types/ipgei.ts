/**
 * Types du moteur académique IPGEI (MPSI → MP).
 *
 * Miroir des serializers de `apps/ipgei` côté backend. Ces types sont la source
 * unique pour le module : ne pas les redéclarer localement dans les pages.
 */

// ── Vocabulaire du cursus ────────────────────────────────────────────────────
/**
 * Code d'un niveau : « MPSI », « MP », et ceux ajoutés au référentiel — « MPI »
 * par exemple. Volontairement ouvert : la liste vit en base depuis que les
 * niveaux s'administrent, et la figer ici rejetterait tout ajout à la
 * compilation. Les valeurs affichables se lisent via `useNiveauxCursus()`.
 */
export type NiveauIPGEI    = string;
export type CodeSemestre   = 'S1' | 'S2' | 'S3' | 'S4';
export type TypeSemestre   = 'I' | 'P';
export type TypeSeance     = 'cours' | 'td' | 'tp' | 'ds';
export type TypeSemaine    = 'cours' | 'examen' | 'vacances' | 'ferie';

/**
 * Cursus d'origine — repli d'affichage tant que le référentiel n'est pas chargé.
 * Ne plus s'en servir pour proposer un choix : passer par `useNiveauxCursus()`,
 * sans quoi les niveaux ajoutés resteraient invisibles.
 */
export const NIVEAUX: { value: NiveauIPGEI; label: string }[] = [
  { value: 'MPSI', label: 'MPSI — 1re année' },
  { value: 'MP',   label: 'MP — 2e année' },
];

/**
 * Un semestre appartient à une année d'étude, pas à un niveau : S1 est celui
 * de tous les niveaux de première année. L'étiqueter « S1 — MPSI » laissait
 * croire qu'ouvrir un MPI de première année demandait un semestre de plus.
 */
export const CODES_SEMESTRE: { value: CodeSemestre; label: string; rang: number }[] = [
  { value: 'S1', label: 'S1 — 1re année', rang: 1 },
  { value: 'S2', label: 'S2 — 1re année', rang: 1 },
  { value: 'S3', label: 'S3 — 2e année',  rang: 2 },
  { value: 'S4', label: 'S4 — 2e année',  rang: 2 },
];

export const TYPES_SEANCE: { value: TypeSeance; label: string }[] = [
  { value: 'cours', label: 'Cours' },
  { value: 'td',    label: 'TD' },
  { value: 'tp',    label: 'TP' },
  { value: 'ds',    label: 'Devoir surveillé' },
];

/** Année d'étude d'un semestre — S1/S2 en 1re, S3/S4 en 2e. */
export function rangDuSemestre(code: CodeSemestre): number {
  return code === 'S1' || code === 'S2' ? 1 : 2;
}

/**
 * Niveau du cursus — MPSI, MP, et ceux qu'on ajoute.
 *
 * Le rang commande les semestres suivis et le tarif appliqué ; le reste dit ce
 * que le jury peut prononcer à ce niveau. `NiveauIPGEI` (le type union) reste
 * la clé d'usage : classes et délibérations portent le code, pas l'identifiant.
 */
export interface NiveauCursus {
  id:                    number;
  institution:           number | null;
  code:                  string;
  libelle:               string;
  /** 1 = première année, 2 = deuxième. Deux niveaux peuvent le partager. */
  rang:                  number;
  libelle_rang:          string;
  codes_semestres:       CodeSemestre[];
  redoublement_autorise: boolean;
  /** Codes des décisions permises au jury. Vide = celles du rang. */
  decisions_possibles:   string[];
  actif:                 boolean;
  ordre:                 number;
  nb_classes:            number;
  nb_matieres:           number;
}

export type NiveauCursusInput = Partial<Omit<NiveauCursus,
  'id' | 'libelle_rang' | 'codes_semestres' | 'nb_classes' | 'nb_matieres'>>;

// ── Paramètres ───────────────────────────────────────────────────────────────
export interface ParametresIPGEI {
  id:                     number;
  institution:            number;
  /** Seuil des délibérations annuelles. */
  seuil_validation:       string;
  /** Seuil des semestrielles. Nul = même exigence que les annuelles. */
  seuil_validation_semestre: string | null;
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
  /** 1 = première année, 2 = deuxième. C'est le vrai rattachement du semestre. */
  rang:                 number;
  /** « 1re année », « 2e année ». */
  libelle_annee:        string;
  /**
   * Niveaux actifs qui suivent ce semestre — MPSI et MPI partagent la 1re année.
   *
   * Il n'y a délibérément pas de `niveau` au singulier : la propriété existait,
   * rendait le premier niveau du rang, et cinq écrans s'en servaient pour
   * retrouver le semestre d'une classe. L'ajout de MPI a fait basculer sa
   * valeur et ces écrans se sont vidés sans erreur.
   */
  niveaux:              NiveauIPGEI[];
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
  /** Code du niveau, dérivé côté serveur. */
  niveau:         NiveauIPGEI;
  /** Niveau dont la matière fait partie de la maquette. */
  niveau_ref:     number | null;
  niveau_ref_code: string;
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
  /** Classe d'attente d'un niveau : ni planifiée, ni cible d'affectation. */
  est_conteneur:       boolean;
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
  /** Vrai tant que l'inscrit est dans la classe d'attente de son niveau. */
  en_attente_affectation: boolean;
  statut:               StatutInscription;
  statut_display:       string;
  nb_redoublements:     number;
  /** Montant figé au moment de l'inscription, d'après la grille tarifaire. */
  montant_frais:        string;
  est_payee:            boolean;
  date_paiement:        string | null;
  recu_paiement:        string;
  date_inscription:     string;
  actif:                boolean;
}

/** Identité saisie lors de l'inscription d'un étudiant encore inconnu. */
export interface NouvelEtudiant {
  matricule:          string;
  /** Nom COMPLET, prénoms inclus — la forme du référentiel officiel et du MESRS. */
  nom:                string;
  nom_ar?:            string;
  /** Accepté par le serveur, mais le formulaire ne scinde plus l'état civil. */
  prenom_fr?:         string;
  genre?:             'M' | 'F';
  date_naissance?:    string | null;
  lieu_naissance_fr?: string;
  lieu_naissance_ar?: string;
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
/**
 * Réponse d'une inscription : la fiche créée, plus le nombre de matières
 * auxquelles l'étudiant vient d'être rattaché.
 *
 * L'inscription pédagogique étant automatique — ni dette ni crédit, donc
 * aucun choix à faire — ce compte est la seule preuve visible qu'elle a bien
 * eu lieu. Sans lui, l'utilisateur ne saurait pas si les matières suivent.
 */
export interface InscriptionCreee extends Inscription {
  matieres_inscrites: number;
}

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
/** Une matière qu'un enseignant a en charge dans une classe, pour un semestre. */
export interface FeuilleEnseignant {
  classe:              number;
  classe_nom:          string;
  matiere:             number;
  matiere_code:        string;
  matiere_intitule:    string;
  semestre:            number;
  semestre_code:       CodeSemestre;
  annee_universitaire: string;
  /** Nombre de séances planifiées — ce qui fonde le périmètre. */
  seances:             number;
}

/** Correspondance numéro ↔ étudiant : sa lecture est la levée d'anonymat. */
export interface AnonymatIPGEI {
  numero:             number;
  inscription:        number;
  etudiant_nom:       string;
  etudiant_matricule: string;
  classe:             string;
}

export interface SaisieAnonyme {
  semestre:        number;
  matiere:         number;
  numero_anonymat: number;
  type_evaluation: TypeEvaluation;
  numero:          number;
  valeur:          string;
}

/** Écho de la saisie : volontairement sans nom ni matricule. */
export interface SaisieAnonymeResultat {
  numero_anonymat: number;
  matiere:         string;
  type_evaluation: TypeEvaluation;
  numero:          number;
  valeur:          string;
}

/** Rôle au sein du jury — le président arrête la séance, un seul par délibération. */
export type RoleJuryIPGEI = 'president' | 'directeur' | 'enseignant' | 'secretaire';

export interface MembreJuryIPGEI {
  id:              number;
  deliberation:    number;
  utilisateur:     number;
  utilisateur_nom: string;
  role:            RoleJuryIPGEI;
  role_display:    string;
  /** Posée par l'action `signer` uniquement — jamais écrite directement. */
  signature_le:    string | null;
  a_signe:         boolean;
}

/** Campagne de saisie d'un semestre : la normale (DS, TP, examens) ou le rattrapage. */
export type TypeSessionIPGEI = 'normale' | 'rattrapage';

/** `fermee` = pas encore ouverte, `close` = terminée (réouverture réservée admin). */
export type EtatSessionIPGEI = 'fermee' | 'ouverte' | 'close';

export interface SessionEvaluationIPGEI {
  id:                   number;
  semestre:             number;
  semestre_code:        CodeSemestre;
  semestre_annee:       string;
  semestre_cloture:     boolean;
  type_session:         TypeSessionIPGEI;
  type_session_display: string;
  etat:                 EtatSessionIPGEI;
  est_saisissable:      boolean;
  est_ouverte:          boolean;
  est_close:            boolean;
  date_debut_saisie:    string | null;
  date_fin_saisie:      string | null;
  /** Figé à la création de la session ; `null` = sans plafond. */
  plafond_rattrapage:   string | null;
  ouverte_le:           string | null;
  cloturee_le:          string | null;
  cloturee_par:         number | null;
  cloturee_par_nom:     string;
}

export interface GrilleNotes {
  matiere:     Matiere;
  semestre:    SemestreIPGEI;
  nb_ds:       number;
  nb_examens:  number;
  /** Semestre clôturé : plus rien n'est saisissable, quelle que soit la campagne. */
  verrouillee: boolean;
  sessions:    SessionEvaluationIPGEI[];
  /** La campagne des DS, TP et examens accepte-t-elle des notes maintenant ? */
  saisie_normale:    boolean;
  /** Et celle du rattrapage ? Les deux ne sont jamais ouvertes en même temps. */
  saisie_rattrapage: boolean;
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

/** Toutes les décisions qu'un jury peut prononcer, pour le paramétrage. */
export const DECISIONS_JURY: { value: DecisionJury; label: string }[] = [
  { value: 'admis',         label: 'Admis en 2e année' },
  { value: 'reoriente',     label: 'Réorienté' },
  { value: 'autorise_cnim', label: 'Autorisé à concourir (CNIM)' },
  { value: 'redoublant',    label: 'Redoublant' },
  { value: 'exclu',         label: 'Exclu — droit épuisé' },
];

/**
 * Décisions du cursus d'origine. Repli seulement : la liste qui fait foi arrive
 * avec la délibération (`decisions_niveau`), car un code seul ne dit pas s'il
 * s'agit d'une première ou d'une deuxième année.
 */
export const DECISIONS_PAR_NIVEAU: Record<string, { value: DecisionJury; label: string }[]> = {
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
  nb_membres_jury:     number;
  nb_signatures:       number;
  /** Décisions déjà éditées — ce qu'une dévalidation remettrait en cause. */
  nb_decisions_emises: number;
  /** Décisions que le jury peut prononcer à ce niveau — calculées côté serveur. */
  decisions_niveau:    { value: DecisionJury; label: string }[];
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
  /** Pourquoi rien n'est proposé — vide quand une proposition existe. */
  motif_sans_proposition: string;
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

/**
 * Ce dont une grille a besoin pour s'afficher — rien de plus.
 *
 * `SeanceReelle` (la séance en préparation) et `SeanceArchivee` (la séance
 * publiée) s'y conforment toutes deux. Les écrans de consultation parlent donc
 * ce langage-là, et non l'un des deux modèles : c'est ce qui permet à la même
 * grille de montrer l'un ou l'autre sans être écrite en double, et donc sans
 * qu'elles divergent.
 */
export interface SeanceAffichable {
  id:                  number;
  jour:                number | null;
  creneau:             number | null;
  matiere:             number | null;
  sous_groupe:         number | null;
  type_seance:         number | null;
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
}

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
  /** Contrepartie de l'échange — nulle sur un transfert simple. */
  inscription_b:        number | null;
  etudiant_b_nom:       string;
  etudiant_b_matricule: string;
  est_echange:          boolean;
  sous_groupe_cible_b:  number | null;
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
  classes:   { total: number };
  effectifs: { total: number };
  /** Répartition par niveau, lue au référentiel : MPSI, MP, et ceux qu'on ajoute. */
  par_niveau: { code: string; libelle: string; classes: number; effectifs: number }[];
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
