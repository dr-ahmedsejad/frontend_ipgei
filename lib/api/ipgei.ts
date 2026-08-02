/**
 * Client API du moteur académique IPGEI — /api/v1/ipgei/
 *
 * Aucune page n'appelle `apiFetch` directement : elle passe par ces méthodes,
 * puis par les hooks TanStack Query de `ipgei-hooks.ts`.
 */
import { apiFetch, apiFetchBlob, apiFetchBlobPost, apiFetchPaginated } from '@/lib/api';
import type {
  AbsenceSeance, Classe, ClasseInput, ClasseSelect, Deliberation, DocumentIPGEI,
  FeuilleAppel, GrilleNotes, GrilleType, HistoriqueClasse, Inscription,
  InscriptionComplete,
  LigneDeliberation, Matiere, MatiereInput, MatiereSelect, Note, OccupationCreneau,
  SeanceArchivee, VersionArchive,
  ParametresIPGEI, PermutationEtudiant, PermutationProf, ReleveAnnuel,
  ReleveSemestre, ResultatDuplication, ResumeIPGEI, SaisieCollective,
  SeanceReelle, SeanceType, SemaineIPGEI, SemestreIPGEI, SousGroupeTP,
  StatistiquesDeliberation, StatutAbsence, TypeDocumentIPGEI,
} from '@/types/ipgei';

const BASE = '/api/v1/ipgei';

/** Filtres de requete : valeurs scalaires uniquement, les vides sont retires. */
export type Params = Record<string, string | number | boolean | undefined | null>;

/** Retire les filtres vides pour ne pas envoyer `?classe=&search=` au backend. */
function nettoyer(params: Params = {}): Record<string, string | number> {
  const sortie: Record<string, string | number> = {};
  for (const [cle, valeur] of Object.entries(params)) {
    if (valeur === undefined || valeur === null || valeur === '') continue;
    sortie[cle] = typeof valeur === 'boolean' ? String(valeur) : valeur;
  }
  return sortie;
}

// ── Paramètres ───────────────────────────────────────────────────────────────
export const parametresApi = {
  courant: () => apiFetch<ParametresIPGEI>(`${BASE}/parametres/courant/`),
  update:  (input: Partial<ParametresIPGEI>) =>
    apiFetch<ParametresIPGEI>(`${BASE}/parametres/courant/`, { method: 'PATCH', body: input }),
};

// ── Calendrier ───────────────────────────────────────────────────────────────
export interface SemestreFilters extends Params {
  page?: number; annee_universitaire?: string; code?: string; est_cloture?: boolean;
}

export const semestresApi = {
  list:     (f: SemestreFilters = {}) => apiFetchPaginated<SemestreIPGEI>(`${BASE}/semestres/`, nettoyer(f)),
  all:      (f: SemestreFilters = {}) => apiFetch<SemestreIPGEI[]>(`${BASE}/semestres/all/`, { params: nettoyer(f) }),
  retrieve: (id: number) => apiFetch<SemestreIPGEI>(`${BASE}/semestres/${id}/`),
  create:   (input: Partial<SemestreIPGEI>) =>
    apiFetch<SemestreIPGEI>(`${BASE}/semestres/`, { method: 'POST', body: input }),
  update:   (id: number, input: Partial<SemestreIPGEI>) =>
    apiFetch<SemestreIPGEI>(`${BASE}/semestres/${id}/`, { method: 'PATCH', body: input }),
  remove:   (id: number) => apiFetch<void>(`${BASE}/semestres/${id}/`, { method: 'DELETE' }),

  /** Ajoute `nb` semaines à la suite des existantes (défaut : celui du semestre). */
  genererSemaines: (id: number, remplacer = false, nb?: number) =>
    apiFetch<{ semaines_creees: number; total: number }>(
      `${BASE}/semestres/${id}/generer-semaines/`,
      { method: 'POST', body: { remplacer, ...(nb ? { nb_semaines: nb } : {}) } },
    ),
  /** `classe` restreint l'état de cohérence à cette classe plutôt qu'au niveau. */
  semaines:  (id: number, classe?: number | null) =>
    apiFetch<SemaineIPGEI[]>(`${BASE}/semestres/${id}/semaines/`,
      { params: nettoyer({ classe }) }),
  cloturer:  (id: number) => apiFetch<SemestreIPGEI>(`${BASE}/semestres/${id}/cloturer/`, { method: 'POST' }),
};

export const semainesApi = {
  list:   (f: Params = {}) => apiFetch<SemaineIPGEI[]>(`${BASE}/semaines/`, { params: nettoyer(f) }),
  update: (id: number, input: Partial<SemaineIPGEI>) =>
    apiFetch<SemaineIPGEI>(`${BASE}/semaines/${id}/`, { method: 'PATCH', body: input }),
};

// ── Classes ──────────────────────────────────────────────────────────────────
export interface ClasseFilters extends Params {
  page?: number; search?: string; niveau?: string; annee_universitaire?: string; actif?: boolean;
}

export const classesApi = {
  list:     (f: ClasseFilters = {}) => apiFetchPaginated<Classe>(`${BASE}/classes/`, nettoyer(f)),
  select:   (f: ClasseFilters = {}) => apiFetch<ClasseSelect[]>(`${BASE}/classes/select/`, { params: nettoyer(f) }),
  retrieve: (id: number) => apiFetch<Classe>(`${BASE}/classes/${id}/`),
  create:   (input: ClasseInput) => apiFetch<Classe>(`${BASE}/classes/`, { method: 'POST', body: input }),
  update:   (id: number, input: Partial<ClasseInput>) =>
    apiFetch<Classe>(`${BASE}/classes/${id}/`, { method: 'PATCH', body: input }),
  remove:   (id: number) => apiFetch<void>(`${BASE}/classes/${id}/`, { method: 'DELETE' }),
  etudiants:(id: number) => apiFetch<Inscription[]>(`${BASE}/classes/${id}/etudiants/`),
};

export const sousGroupesApi = {
  list:   (classe?: number) => apiFetch<SousGroupeTP[]>(`${BASE}/sous-groupes/`, { params: nettoyer({ classe }) }),
  create: (input: { classe: number; libelle: string; matieres?: number[] }) =>
    apiFetch<SousGroupeTP>(`${BASE}/sous-groupes/`, { method: 'POST', body: input }),
  update: (id: number, input: { libelle?: string; matieres?: number[] }) =>
    apiFetch<SousGroupeTP>(`${BASE}/sous-groupes/${id}/`, { method: 'PATCH', body: input }),
  remove: (id: number) => apiFetch<void>(`${BASE}/sous-groupes/${id}/`, { method: 'DELETE' }),
};

// ── Inscriptions ─────────────────────────────────────────────────────────────
export interface InscriptionFilters extends Params {
  page?: number; search?: string; classe?: number; annee_universitaire?: string;
  statut?: string; actif?: boolean; sous_groupe?: number;
  'classe__niveau'?: string;
}

export const inscriptionsApi = {
  list:     (f: InscriptionFilters = {}) => apiFetchPaginated<Inscription>(`${BASE}/inscriptions/`, nettoyer(f)),
  all:      (f: InscriptionFilters = {}) => apiFetch<Inscription[]>(`${BASE}/inscriptions/all/`, { params: nettoyer(f) }),
  retrieve: (id: number) => apiFetch<Inscription>(`${BASE}/inscriptions/${id}/`),
  create:   (input: Partial<Inscription>) =>
    apiFetch<Inscription>(`${BASE}/inscriptions/`, { method: 'POST', body: input }),
  update:   (id: number, input: Partial<Inscription>) =>
    apiFetch<Inscription>(`${BASE}/inscriptions/${id}/`, { method: 'PATCH', body: input }),
  remove:   (id: number) => apiFetch<void>(`${BASE}/inscriptions/${id}/`, { method: 'DELETE' }),

  /** Inscription complète : crée l'étudiant au besoin, puis le rattache. */
  nouvelle: (input: InscriptionComplete) =>
    apiFetch<Inscription>(`${BASE}/inscriptions/nouvelle/`, { method: 'POST', body: input }),

  initialiserNotes: (id: number, semestre: number) =>
    apiFetch<{ notes_creees: number }>(
      `${BASE}/inscriptions/${id}/initialiser-notes/`, { method: 'POST', body: { semestre } },
    ),
  releveSemestre: (id: number, semestre: number) =>
    apiFetch<ReleveSemestre>(`${BASE}/inscriptions/${id}/releve/`, { params: { semestre } }),
  releveAnnuel:   (id: number) => apiFetch<ReleveAnnuel>(`${BASE}/inscriptions/${id}/releve/`),
  historique:     (id: number) => apiFetch<HistoriqueClasse[]>(`${BASE}/inscriptions/${id}/historique-classes/`),
  absences:       (id: number, semestre?: number) =>
    apiFetch<{ bilan: import('@/types/ipgei').BilanAbsences; detail: AbsenceSeance[] }>(
      `${BASE}/inscriptions/${id}/absences/`, { params: nettoyer({ semestre }) },
    ),
};

// ── Matières ─────────────────────────────────────────────────────────────────
export interface MatiereFilters extends Params {
  page?: number; search?: string; code_semestre?: string; has_tp?: boolean; actif?: boolean;
}

export const matieresApi = {
  list:     (f: MatiereFilters = {}) => apiFetchPaginated<Matiere>(`${BASE}/matieres/`, nettoyer(f)),
  all:      (f: MatiereFilters = {}) => apiFetch<Matiere[]>(`${BASE}/matieres/all/`, { params: nettoyer(f) }),
  select:   (f: MatiereFilters = {}) => apiFetch<MatiereSelect[]>(`${BASE}/matieres/select/`, { params: nettoyer(f) }),
  retrieve: (id: number) => apiFetch<Matiere>(`${BASE}/matieres/${id}/`),
  create:   (input: MatiereInput) => apiFetch<Matiere>(`${BASE}/matieres/`, { method: 'POST', body: input }),
  update:   (id: number, input: MatiereInput) =>
    apiFetch<Matiere>(`${BASE}/matieres/${id}/`, { method: 'PATCH', body: input }),
  remove:   (id: number) => apiFetch<void>(`${BASE}/matieres/${id}/`, { method: 'DELETE' }),
  reinitialiserPonderation: (id: number) =>
    apiFetch<Matiere>(`${BASE}/matieres/${id}/reinitialiser-ponderation/`, { method: 'POST' }),
};

// ── Notes ────────────────────────────────────────────────────────────────────
export const notesApi = {
  grille: (classe: number, matiere: number, semestre: number) =>
    apiFetch<GrilleNotes>(`${BASE}/notes/grille/`, { params: { classe, matiere, semestre } }),

  saisieCollective: (input: SaisieCollective) =>
    apiFetch<{ lignes_traitees: number }>(
      `${BASE}/notes/saisie-collective/`, { method: 'POST', body: input },
    ),

  recalculer: (id: number) => apiFetch<Note>(`${BASE}/notes/${id}/recalculer/`, { method: 'POST' }),

  recalculerLot: (semestre: number, classe?: number) =>
    apiFetch<{ notes_recalculees: number }>(
      `${BASE}/notes/recalculer-lot/`, { method: 'POST', body: nettoyer({ semestre, classe }) },
    ),

  update: (id: number, input: Partial<Note>) =>
    apiFetch<Note>(`${BASE}/notes/${id}/`, { method: 'PATCH', body: input }),
};

// ── Délibération ─────────────────────────────────────────────────────────────
export interface DeliberationFilters extends Params {
  page?: number; niveau?: string; annee_universitaire?: string;
  portee?: string; statut?: string; semestre?: number;
}

export const deliberationsApi = {
  list:     (f: DeliberationFilters = {}) => apiFetchPaginated<Deliberation>(`${BASE}/deliberations/`, nettoyer(f)),
  retrieve: (id: number) => apiFetch<Deliberation>(`${BASE}/deliberations/${id}/`),
  create:   (input: Partial<Deliberation>) =>
    apiFetch<Deliberation>(`${BASE}/deliberations/`, { method: 'POST', body: input }),
  update:   (id: number, input: Partial<Deliberation>) =>
    apiFetch<Deliberation>(`${BASE}/deliberations/${id}/`, { method: 'PATCH', body: input }),
  remove:   (id: number) => apiFetch<void>(`${BASE}/deliberations/${id}/`, { method: 'DELETE' }),

  calculer: (id: number) =>
    apiFetch<{ lignes: number; deliberation: Deliberation }>(
      `${BASE}/deliberations/${id}/calculer/`, { method: 'POST' },
    ),
  valider:  (id: number) => apiFetch<Deliberation>(`${BASE}/deliberations/${id}/valider/`, { method: 'POST' }),
  lignes:   (id: number, classe?: number) =>
    apiFetch<LigneDeliberation[]>(`${BASE}/deliberations/${id}/lignes/`, { params: nettoyer({ classe }) }),
  statistiques: (id: number) =>
    apiFetch<StatistiquesDeliberation>(`${BASE}/deliberations/${id}/statistiques/`),
};

export const lignesDeliberationApi = {
  retrieve: (id: number) => apiFetch<LigneDeliberation>(`${BASE}/lignes-deliberation/${id}/`),
  update:   (id: number, input: { decision?: string; motif_ajustement?: string; observations?: string }) =>
    apiFetch<LigneDeliberation>(`${BASE}/lignes-deliberation/${id}/`, { method: 'PATCH', body: input }),
};

// ── EDT ──────────────────────────────────────────────────────────────────────
export const grillesApi = {
  list:     (f: Params = {}) => apiFetch<GrilleType[]>(`${BASE}/grilles/`, { params: nettoyer(f) }),

  /** Grille d'une classe, créée à la volée si elle n'existe pas encore. */
  pourClasse: (classe: number, type_semestre: string) =>
    apiFetch<GrilleType>(`${BASE}/grilles/pour-classe/`, { params: { classe, type_semestre } }),
  retrieve: (id: number) => apiFetch<GrilleType>(`${BASE}/grilles/${id}/`),
  create:   (input: { classe: number; type_semestre: string; libelle?: string }) =>
    apiFetch<GrilleType>(`${BASE}/grilles/`, { method: 'POST', body: input }),
  update:   (id: number, input: Partial<GrilleType>) =>
    apiFetch<GrilleType>(`${BASE}/grilles/${id}/`, { method: 'PATCH', body: input }),
  remove:   (id: number) => apiFetch<void>(`${BASE}/grilles/${id}/`, { method: 'DELETE' }),

  dupliquer: (id: number, input: {
    semestre: number; semaine_debut?: number | null; nb_semaines?: number; ecraser?: boolean;
  }) => apiFetch<ResultatDuplication>(`${BASE}/grilles/${id}/dupliquer/`, { method: 'POST', body: input }),
};

export const seancesTypeApi = {
  list:   (grille: number) => apiFetch<SeanceType[]>(`${BASE}/seances-type/`, { params: { grille } }),
  create: (input: Partial<SeanceType>) =>
    apiFetch<SeanceType>(`${BASE}/seances-type/`, { method: 'POST', body: input }),
  update: (id: number, input: Partial<SeanceType>) =>
    apiFetch<SeanceType>(`${BASE}/seances-type/${id}/`, { method: 'PATCH', body: input }),
  remove: (id: number) => apiFetch<void>(`${BASE}/seances-type/${id}/`, { method: 'DELETE' }),
};

/**
 * Emplois du temps figés à la génération du suivi. Lecture seule : la seule
 * écriture possible est la prise de vue, faite par le serveur au moment où le
 * suivi est généré.
 */
export const archivesEdtApi = {
  versions: (classe: number, semestre?: number | null) =>
    apiFetch<VersionArchive[]>(`${BASE}/archives-edt/versions/`,
      { params: nettoyer({ classe, semestre }) }),
  /**
   * Emploi du temps publié d'une semaine, par classe, par enseignant ou par
   * salle. Sans `version`, la dernière publication de chaque classe.
   */
  grille: (f: {
    semaine: number; classe?: number | null; prof?: number | null;
    salle?: number | null; version?: number | null;
  }) => apiFetch<SeanceArchivee[]>(`${BASE}/archives-edt/grille/`,
    { params: nettoyer(f) }),
};

export const seancesApi = {
  parSemaine: (classe: number, semaine: number) =>
    apiFetch<SeanceReelle[]>(`${BASE}/seances/semaine/`, { params: { classe, semaine } }),
  list:   (f: Params = {}) => apiFetch<SeanceReelle[]>(`${BASE}/seances/`, { params: nettoyer(f) }),

  /**
   * Enseignants et salles pris par les AUTRES classes sur chaque créneau.
   *
   * Sans `semaine`, la réponse porte sur les grilles types de la même année et
   * du même type de semestre.
   */
  occupation: (f: { classe: number; semaine?: number | null; type_semestre?: string }) =>
    apiFetch<OccupationCreneau[]>(`${BASE}/seances/occupation/`, { params: nettoyer(f) }),
  create: (input: Partial<SeanceReelle>) =>
    apiFetch<SeanceReelle>(`${BASE}/seances/`, { method: 'POST', body: input }),
  update: (id: number, input: Partial<SeanceReelle>) =>
    apiFetch<SeanceReelle>(`${BASE}/seances/${id}/`, { method: 'PATCH', body: input }),
  remove: (id: number) => apiFetch<void>(`${BASE}/seances/${id}/`, { method: 'DELETE' }),

  /** Reporte une modification sur N semaines consécutives (même case horaire). */
  appliquerLot: (id: number, input: {
    nb_semaines: number; prof?: number | null; salle?: number | null;
    matiere?: number | null; annulee?: boolean;
  }) => apiFetch<{
    seances_modifiees: number; seances_creees: number; semaines_traitees: number;
  }>(
    `${BASE}/seances/${id}/appliquer-lot/`, { method: 'POST', body: input },
  ),

  feuilleAppel: (id: number) => apiFetch<FeuilleAppel>(`${BASE}/seances/${id}/absences/`),

  /** Saisie par exception : on n'envoie QUE les non-présents. */
  saisirAbsences: (id: number, absents: {
    inscription: number; statut: StatutAbsence; justificatif?: string;
  }[]) => apiFetch<{ enregistrees: number; reinitialisees: number }>(
    `${BASE}/seances/${id}/absences/`, { method: 'POST', body: { absents } },
  ),
};

// ── Permutations ─────────────────────────────────────────────────────────────
function workflow<T>(chemin: string) {
  return {
    accorder:  (id: number) => apiFetch<T>(`${BASE}/${chemin}/${id}/accorder/`,  { method: 'POST' }),
    valider:   (id: number) => apiFetch<T>(`${BASE}/${chemin}/${id}/valider/`,   { method: 'POST' }),
    appliquer: (id: number) => apiFetch<T>(`${BASE}/${chemin}/${id}/appliquer/`, { method: 'POST' }),
    refuser:   (id: number, motif_refus = '') =>
      apiFetch<T>(`${BASE}/${chemin}/${id}/refuser/`, { method: 'POST', body: { motif_refus } }),
  };
}

export const permutationsProfApi = {
  list:   (f: Params = {}) => apiFetchPaginated<PermutationProf>(`${BASE}/permutations-prof/`, nettoyer(f)),
  create: (input: {
    seance_a: number; seance_b: number; nb_semaines: number;
    motif?: string; action_directe?: boolean;
  }) => apiFetch<PermutationProf>(`${BASE}/permutations-prof/`, { method: 'POST', body: input }),
  remove: (id: number) => apiFetch<void>(`${BASE}/permutations-prof/${id}/`, { method: 'DELETE' }),
  ...workflow<PermutationProf>('permutations-prof'),
};

export const permutationsEtudiantApi = {
  list:   (f: Params = {}) => apiFetchPaginated<PermutationEtudiant>(`${BASE}/permutations-etudiant/`, nettoyer(f)),
  create: (input: {
    inscription: number; classe_cible: number; sous_groupe_cible?: number | null;
    motif?: string; action_directe?: boolean;
  }) => apiFetch<PermutationEtudiant>(`${BASE}/permutations-etudiant/`, { method: 'POST', body: input }),
  remove: (id: number) => apiFetch<void>(`${BASE}/permutations-etudiant/${id}/`, { method: 'DELETE' }),
  ...workflow<PermutationEtudiant>('permutations-etudiant'),
};

// ── Absences ─────────────────────────────────────────────────────────────────
export interface AbsenceFilters extends Params {
  page?: number; search?: string; inscription?: number; seance?: number;
  statut?: string; 'inscription__classe'?: number; 'seance__semaine__semestre'?: number;
}

export const absencesApi = {
  list:   (f: AbsenceFilters = {}) => apiFetchPaginated<AbsenceSeance>(`${BASE}/absences/`, nettoyer(f)),
  update: (id: number, input: Partial<AbsenceSeance>) =>
    apiFetch<AbsenceSeance>(`${BASE}/absences/${id}/`, { method: 'PATCH', body: input }),
  remove: (id: number) => apiFetch<void>(`${BASE}/absences/${id}/`, { method: 'DELETE' }),
};

// ── Documents ────────────────────────────────────────────────────────────────
export interface DocumentFilters extends Params {
  page?: number; search?: string; type_document?: TypeDocumentIPGEI;
  annee_universitaire?: string; etudiant?: number;
}

/**
 * Une émission renvoie le PDF lui-même, pas du JSON : elle crée une ligne au
 * registre (numéro de série + token de vérification), d'où le POST.
 */
function emettreDocument(chemin: string, body: Record<string, unknown>): Promise<Blob> {
  return apiFetchBlobPost(`${BASE}/documents/${chemin}/`, body);
}

export const documentsApi = {
  list: (f: DocumentFilters = {}) => apiFetchPaginated<DocumentIPGEI>(`${BASE}/documents/`, nettoyer(f)),

  releveSemestre: (inscription: number, semestre: number) =>
    emettreDocument('releve-semestre', { inscription, semestre }),
  releveAnnuel:   (inscription: number) =>
    emettreDocument('releve-annuel', { inscription }),
  decision:       (deliberation: number, inscription: number) =>
    emettreDocument('decision-deliberation', { deliberation, inscription }),
  attestationCnim:(deliberation: number, inscription: number) =>
    emettreDocument('attestation-cnim', { deliberation, inscription }),

  decisionsClasse: (deliberation: number, classe?: number) =>
    apiFetch<{ emis: number; numeros: string[]; erreurs: { etudiant: string; erreur: string }[] }>(
      `${BASE}/documents/decisions-classe/`, { method: 'POST', body: nettoyer({ deliberation, classe }) },
    ),

  telecharger: (id: number) => apiFetchBlob(`${BASE}/documents/${id}/telecharger/`),
};

// ── Tableau de bord ──────────────────────────────────────────────────────────
export const tableauBordApi = {
  resume: (annee?: string) =>
    apiFetch<ResumeIPGEI>(`${BASE}/tableau-bord/resume/`, { params: nettoyer({ annee }) }),
  annees: () => apiFetch<string[]>(`${BASE}/tableau-bord/annees/`),
};
