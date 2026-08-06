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
  InscriptionComplete, InscriptionCreee,
  AnonymatIPGEI, FeuilleEnseignant, GrilleAnonyme, SaisieAnonyme,
  SaisieAnonymeLot, SaisieAnonymeResultat,
  LigneDeliberation, Matiere, MatiereInput, MatiereSelect, MembreJuryIPGEI,
  NiveauCursus, NiveauCursusInput, Note, OccupationCreneau, RoleJuryIPGEI,
  SeanceArchivee, VersionArchive,
  ParametresIPGEI, PermutationEtudiant, PermutationProf, ReleveAnnuel,
  ReleveSemestre, ResultatDuplication, ResumeIPGEI, SaisieCollective,
  SeanceReelle, SeanceType, SemaineIPGEI, SemestreIPGEI, SessionEvaluationIPGEI,
  Signataire, SousGroupeTP,
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

// ── Niveaux du cursus ────────────────────────────────────────────────────────
export const niveauxApi = {
  list:     (actifsSeuls = false) =>
    apiFetch<NiveauCursus[]>(`${BASE}/niveaux/`,
      { params: nettoyer({ actif: actifsSeuls ? true : undefined }) }),
  create:   (input: NiveauCursusInput) =>
    apiFetch<NiveauCursus>(`${BASE}/niveaux/`, { method: 'POST', body: input }),
  update:   (id: number, input: NiveauCursusInput) =>
    apiFetch<NiveauCursus>(`${BASE}/niveaux/${id}/`, { method: 'PATCH', body: input }),
  remove:   (id: number) => apiFetch<void>(`${BASE}/niveaux/${id}/`, { method: 'DELETE' }),
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

  /**
   * Ouvre une année d'un coup : ses quatre semestres, datés par convention.
   * Ceux déjà présents sont laissés tels quels, dates comprises.
   */
  creerAnnee: (annee: string) =>
    apiFetch<{ annee_universitaire: string; semestres_crees: number; codes: string[] }>(
      `${BASE}/semestres/creer-annee/`, { method: 'POST', body: { annee_universitaire: annee } },
    ),
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
  /** `true` = les inscrits encore dans la classe d'attente de leur niveau. */
  en_attente?: boolean;
}

export const inscriptionsApi = {
  /** Sort un inscrit de la classe d'attente pour le poser dans une classe. */
  affecter: (id: number, classe: number) =>
    apiFetch<Inscription>(`${BASE}/inscriptions/${id}/affecter/`,
      { method: 'POST', body: { classe } }),
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
    apiFetch<InscriptionCreee>(`${BASE}/inscriptions/nouvelle/`,
      { method: 'POST', body: input }),

  /** Enregistre le règlement. Le montant n'est pas ressaisi : il est déjà figé. */
  payer: (id: number, input: { recu_paiement: string; date_paiement?: string }) =>
    apiFetch<Inscription>(`${BASE}/inscriptions/${id}/payer/`,
      { method: 'POST', body: input }),

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
// ── Sessions de saisie ───────────────────────────────────────────────────────
export const sessionsApi = {
  /**
   * Sessions d'une année. Le backend matérialise les campagnes manquantes :
   * la liste est donc toujours complète, deux entrées par semestre.
   */
  list: (annee?: string) =>
    apiFetch<SessionEvaluationIPGEI[]>(
      `${BASE}/sessions/`, { params: nettoyer({ annee_universitaire: annee }) },
    ),

  ouvrir:   (id: number) => apiFetch<SessionEvaluationIPGEI>(`${BASE}/sessions/${id}/ouvrir/`,   { method: 'POST' }),
  cloturer: (id: number) => apiFetch<SessionEvaluationIPGEI>(`${BASE}/sessions/${id}/cloturer/`, { method: 'POST' }),
  rouvrir:  (id: number) => apiFetch<SessionEvaluationIPGEI>(`${BASE}/sessions/${id}/rouvrir/`,  { method: 'POST' }),

  /** Pose le plafond de rattrapage et recalcule le semestre. `null` = sans plafond. */
  plafond: (id: number, valeur: string | null) =>
    apiFetch<SessionEvaluationIPGEI & { notes_recalculees: number }>(
      `${BASE}/sessions/${id}/plafond/`, { method: 'POST', body: { valeur } },
    ),

  update: (id: number, input: Partial<SessionEvaluationIPGEI>) =>
    apiFetch<SessionEvaluationIPGEI>(`${BASE}/sessions/${id}/`, { method: 'PATCH', body: input }),

  /** Table de correspondance numéro ↔ étudiant : c'est la levée d'anonymat. */
  anonymats: (id: number) =>
    apiFetch<AnonymatIPGEI[]>(`${BASE}/sessions/${id}/anonymats/`),

  /** Tirage au sort. `force` n'est accepté qu'à un administrateur. */
  genererAnonymats: (id: number, options: { regenerer?: boolean; force?: boolean } = {}) =>
    apiFetch<{ anonymats_generes: number }>(
      `${BASE}/sessions/${id}/anonymats/`, { method: 'POST', body: options },
    ),
};

export const notesApi = {
  grille: (classe: number, matiere: number, semestre: number) =>
    apiFetch<GrilleNotes>(`${BASE}/notes/grille/`, { params: { classe, matiere, semestre } }),

  /** Périmètre de l'enseignant connecté : ses couples classe × matière. */
  mesFeuilles: (annee?: string) =>
    apiFetch<FeuilleEnseignant[]>(`${BASE}/notes/mes-feuilles/`,
      { params: nettoyer({ annee_universitaire: annee }) }),

  /** Saisie sous numéro d'anonymat — la réponse ne nomme jamais l'étudiant. */
  saisieAnonyme: (input: SaisieAnonyme) =>
    apiFetch<SaisieAnonymeResultat>(
      `${BASE}/notes/saisie-anonyme/`, { method: 'POST', body: input },
    ),

  /**
   * Feuille de correction d'une épreuve : un numéro par ligne, la note en
   * regard. Ne porte ni nom, ni matricule, ni identifiant d'inscription.
   */
  grilleAnonyme: (f: FiltresGrilleAnonyme) =>
    apiFetch<GrilleAnonyme>(`${BASE}/notes/grille-anonyme/`, { params: nettoyer(f) }),

  /** Enregistre la feuille entière — tout passe, ou rien. */
  saisieAnonymeLot: (input: SaisieAnonymeLot) =>
    apiFetch<{ copies_traitees: number }>(
      `${BASE}/notes/saisie-anonyme-lot/`, { method: 'POST', body: input },
    ),

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

  /**
   * Fiche de collecte : la feuille que l'enseignant emporte en salle.
   * `matiere` omise, le serveur édite le jeu complet du semestre.
   */
  ficheCollecte: (f: FiltresCollecte) => {
    const params: Record<string, string> = {};
    for (const [cle, valeur] of Object.entries(nettoyer(f))) {
      params[cle] = String(valeur);
    }
    return apiFetchBlob(`${BASE}/notes/fiche-collecte/`, params);
  },
};

/**
 * `RATT` est une épreuve, pas une campagne : elle emporte la seconde session.
 * Faire choisir les deux revenait à ressaisir la même chose.
 */
export type TypeNoteCollecte = 'DS' | 'TP' | 'EXAM' | 'RATT';

export interface FiltresCollecte extends Params {
  semestre:  number;
  classe:    number;
  matiere?:  number;
  type_note: TypeNoteCollecte;
  anonymat?: 1 | 0;
  /**
   * `sortie` et non `format` : DRF réserve `format` à la négociation de
   * contenu et répond 404 pour un suffixe qu'aucun renderer ne connaît.
   */
  sortie?:   'pdf' | 'excel';
}

// ── Délibération ─────────────────────────────────────────────────────────────
export type TriDetailNotes = 'rang' | 'matricule' | 'moyenne';

export interface DeliberationFilters extends Params {
  page?: number; niveau?: string; annee_universitaire?: string;
  /** Le jury siège classe par classe : c'est le filtre utile. */
  classe?: number;
  portee?: string; statut?: string; semestre?: number;
}

export interface FiltresGrilleAnonyme extends Params {
  semestre:         number;
  matiere:          number;
  type_evaluation?: 'ds' | 'exam';
  numero?:          number;
}

export const deliberationsApi = {
  list:     (f: DeliberationFilters = {}) => apiFetchPaginated<Deliberation>(`${BASE}/deliberations/`, nettoyer(f)),
  retrieve: (id: number) => apiFetch<Deliberation>(`${BASE}/deliberations/${id}/`),
  create:   (input: Partial<Deliberation>) =>
    apiFetch<Deliberation>(`${BASE}/deliberations/`, { method: 'POST', body: input }),
  update:   (id: number, input: Partial<Deliberation>) =>
    apiFetch<Deliberation>(`${BASE}/deliberations/${id}/`, { method: 'PATCH', body: input }),
  remove:   (id: number) => apiFetch<void>(`${BASE}/deliberations/${id}/`, { method: 'DELETE' }),

  /**
   * (Re)calcule le jury. `seuil` posé, le seuil est d'abord modifié sur la
   * délibération PUIS le calcul relancé — en une requête : deux laisseraient,
   * entre les deux, un seuil qui ne correspond plus aux décisions affichées.
   */
  calculer: (id: number, seuil?: string) =>
    apiFetch<{ lignes: number; deliberation: Deliberation }>(
      `${BASE}/deliberations/${id}/calculer/`,
      { method: 'POST', body: seuil ? { seuil_validation: seuil } : {} },
    ),
  valider:  (id: number) => apiFetch<Deliberation>(`${BASE}/deliberations/${id}/valider/`, { method: 'POST' }),
  /** Retire la validation : restaure les inscriptions, déverrouille les notes. Admin. */
  devalider: (id: number) =>
    apiFetch<Deliberation>(`${BASE}/deliberations/${id}/devalider/`, { method: 'POST' }),
  lignes:   (id: number, classe?: number) =>
    apiFetch<LigneDeliberation[]>(`${BASE}/deliberations/${id}/lignes/`, { params: nettoyer({ classe }) }),
  statistiques: (id: number) =>
    apiFetch<StatistiquesDeliberation>(`${BASE}/deliberations/${id}/statistiques/`),

  /** Signature du PV par le membre de jury connecté — on ne signe que pour soi. */
  signer:   (id: number) =>
    apiFetch<MembreJuryIPGEI>(`${BASE}/deliberations/${id}/signer/`, { method: 'POST' }),

  /** PV complet. Tant que la délibération n'est pas validée, il porte « projet ». */
  pvPdf:    (id: number) => apiFetchBlob(`${BASE}/deliberations/${id}/pv-pdf/`),
  pvExcel:  (id: number) => apiFetchBlob(`${BASE}/deliberations/${id}/pv-excel/`),
  /** Document de séance : un bloc par élève, détail matière par matière. */
  /**
   * `tri` commande l'ordre des blocs du document de séance : par classement
   * pour délibérer du haut vers le bas, par matricule pour retrouver un
   * dossier qu'on présente au jury, par moyenne pour les cas limites.
   */
  detailNotes: (id: number, tri: TriDetailNotes = 'rang') =>
    apiFetchBlob(`${BASE}/deliberations/${id}/detail-notes/`, { tri }),
};

export const membresJuryApi = {
  list:   (deliberation: number) =>
    apiFetch<MembreJuryIPGEI[]>(`${BASE}/membres-jury/`, { params: { deliberation } }),
  create: (input: { deliberation: number; utilisateur: number; role: RoleJuryIPGEI }) =>
    apiFetch<MembreJuryIPGEI>(`${BASE}/membres-jury/`, { method: 'POST', body: input }),
  remove: (id: number) => apiFetch<void>(`${BASE}/membres-jury/${id}/`, { method: 'DELETE' }),
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
  /**
   * Demande, valide et applique en un seul appel — réservé côté serveur à qui
   * pouvait déjà trancher seul. Évite les trois appels et le détour par
   * l'écran des permutations pour un geste fait depuis la grille.
   */
  permuterMaintenant: (input: {
    seance_a: number; seance_b: number; nb_semaines: number; motif?: string;
  }) => apiFetch<PermutationProf & { seances_impactees: number }>(
    `${BASE}/permutations-prof/permuter-maintenant/`, { method: 'POST', body: input }),
  ...workflow<PermutationProf>('permutations-prof'),
};

export const permutationsEtudiantApi = {
  /** Formulaire papier vierge, à remplir et signer. */
  formulaire: (annee?: string) => apiFetchBlob(
    `${BASE}/permutations-etudiant/formulaire/${annee ? `?annee=${annee}` : ''}`),
  /**
   * Enregistre ET applique le mouvement. La demande arrive signée sur papier :
   * le circuit accord → validation redemanderait par écran ce qui l'est déjà.
   */
  appliquerMaintenant: (input: {
    inscription: number; classe_cible: number; inscription_b?: number | null;
    sous_groupe_cible?: number | null; motif?: string;
  }) => apiFetch<PermutationEtudiant>(
    `${BASE}/permutations-etudiant/appliquer-maintenant/`, { method: 'POST', body: input }),
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

  /**
   * `signataire` n'est utile que sur les pièces signées à la scolarité :
   * omis, le serveur retient le signataire par défaut de l'institution.
   */
  releveSemestre: (inscription: number, semestre: number, signataire?: number) =>
    emettreDocument('releve-semestre', nettoyer({ inscription, semestre, signataire })),
  releveAnnuel:   (inscription: number, signataire?: number) =>
    emettreDocument('releve-annuel', nettoyer({ inscription, signataire })),
  decision:       (deliberation: number, inscription: number) =>
    emettreDocument('decision-deliberation', { deliberation, inscription }),
  attestationCnim:(deliberation: number, inscription: number) =>
    emettreDocument('attestation-cnim', { deliberation, inscription }),
  /** Attestation de scolarité de l'année en cours, maquette comprise. */
  attestationInscription: (inscription: number, signataire?: number) =>
    emettreDocument('attestation-inscription', nettoyer({ inscription, signataire })),
  /** Reçu des frais — refusé tant que le paiement n'est pas enregistré. */
  recuPaiement:   (inscription: number) =>
    emettreDocument('recu-paiement', { inscription }),

  decisionsClasse: (deliberation: number, classe?: number) =>
    apiFetch<{ emis: number; numeros: string[]; erreurs: { etudiant: string; erreur: string }[] }>(
      `${BASE}/documents/decisions-classe/`, { method: 'POST', body: nettoyer({ deliberation, classe }) },
    ),

  telecharger: (id: number) => apiFetchBlob(`${BASE}/documents/${id}/telecharger/`),
};

// ── Signataires ──────────────────────────────────────────────────────────────
/**
 * Qui signe les documents. Aucune image : la signature reste manuscrite, seuls
 * le nom et la fonction imprimés au-dessus du trait changent — de quoi faire
 * signer un suppléant quand le chef de scolarité est absent.
 */
export const signatairesApi = {
  list:   (f: { actif?: boolean } = {}) =>
    apiFetch<Signataire[]>(`${BASE}/signataires/`, { params: nettoyer(f) }),
  create: (input: Partial<Signataire>) =>
    apiFetch<Signataire>(`${BASE}/signataires/`, { method: 'POST', body: input }),
  update: (id: number, input: Partial<Signataire>) =>
    apiFetch<Signataire>(`${BASE}/signataires/${id}/`, { method: 'PATCH', body: input }),
  remove: (id: number) => apiFetch<void>(`${BASE}/signataires/${id}/`, { method: 'DELETE' }),
};

// ── Tableau de bord ──────────────────────────────────────────────────────────
export const tableauBordApi = {
  resume: (annee?: string) =>
    apiFetch<ResumeIPGEI>(`${BASE}/tableau-bord/resume/`, { params: nettoyer({ annee }) }),
  /**
   * Années ayant au moins une classe. `saisissables` restreint à celles dont un
   * semestre reste ouvert — les seules où une note peut encore être écrite.
   */
  annees: (saisissables = false) =>
    apiFetch<string[]>(`${BASE}/tableau-bord/annees/`,
      { params: nettoyer({ saisissables: saisissables ? true : undefined }) }),
};
