/**
 * Hooks TanStack Query du module IPGEI.
 *
 * Une seule factory de clés (`ipgeiKeys`) pour tout le domaine : invalider
 * `ipgeiKeys.all` purge le module entier, `ipgeiKeys.notes.lists()` seulement
 * les grilles de notes. Aucune page ne pose de queryKey à la main.
 */
import {
  keepPreviousData, useMutation, useQueries, useQuery, useQueryClient,
} from '@tanstack/react-query';

import {
  archivesEdtApi, absencesApi, classementApi, classesApi, concoursApi,
  deliberationsApi, fraudesApi,
  documentsApi, epreuvesApi, grillesApi, ponderationsClasseApi,
  inscriptionsApi, lignesDeliberationApi, matieresApi, membresJuryApi, notesApi,
  parametresApi,
  permutationsEtudiantApi, permutationsProfApi, seancesApi, seancesTypeApi,
  niveauxApi,
  semainesApi, semestresApi, sessionsApi, signatairesApi, sousGroupesApi, tableauBordApi,
  type AbsenceFilters, type ClasseFilters, type DeliberationFilters,
  type EpreuveChoisie, type EpreuveFilters,
  type SaisieRattrapage,
  type FiltresCollecte, type FiltresEmargement, type FiltresGrilleAnonyme, type LotCorrection,
  type Params,
  type TriDetailNotes,
  type DocumentFilters, type FraudeFilters, type InscriptionFilters, type MatiereFilters,
  type SemestreFilters,
} from './ipgei';
import type {
  ClasseInput, Deliberation, InscriptionComplete, MatiereInput,
  NiveauCursusInput, Note, RoleJuryIPGEI,
  SaisieAnonyme, SaisieCollective,
  SaisieAnonymeLot,
  EpreuveInput,
  SeanceReelle, SeanceType, SemaineIPGEI, SemestreIPGEI, SessionEvaluationIPGEI,
  Signataire, StatutAbsence,
} from '@/types/ipgei';
import { NIVEAUX } from '@/types/ipgei';

// ── Factory de query keys ────────────────────────────────────────────────────
const racine = ['ipgei'] as const;

function domaine<F>(nom: string) {
  const base = [...racine, nom] as const;
  return {
    all:     base,
    lists:   () => [...base, 'list'] as const,
    list:    (filters: F) => [...base, 'list', filters] as const,
    details: () => [...base, 'detail'] as const,
    detail:  (id: number) => [...base, 'detail', id] as const,
  };
}

export const ipgeiKeys = {
  all:           racine,
  parametres:    [...racine, 'parametres'] as const,
  tableauBord:   (annee?: string) => [...racine, 'tableau-bord', annee ?? ''] as const,
  annees:        [...racine, 'annees'] as const,
  niveaux:       (actifs: boolean) => [...racine, 'niveaux', actifs] as const,

  semestres:     domaine<SemestreFilters>('semestres'),
  semaines:      (semestre?: number) => [...racine, 'semaines', semestre ?? 0] as const,
  classes:       domaine<ClasseFilters>('classes'),
  classesSelect: (filters: ClasseFilters) => [...racine, 'classes', 'select', filters] as const,
  sousGroupes:   (classe?: number) => [...racine, 'sous-groupes', classe ?? 0] as const,
  inscriptions:  domaine<InscriptionFilters>('inscriptions'),
  matieres:      domaine<MatiereFilters>('matieres'),
  matieresSelect:(filters: MatiereFilters) => [...racine, 'matieres', 'select', filters] as const,

  notes:         domaine<unknown>('notes'),
  grilleNotes:   (classe: number, matiere: number, semestre: number) =>
                   [...racine, 'notes', 'grille', classe, matiere, semestre] as const,
  sessions:      (annee?: string) => [...racine, 'sessions', annee ?? ''] as const,
  calendrierEpreuves: (filters: EpreuveFilters) =>
                   [...racine, 'calendrier-epreuves', filters] as const,
  epreuvesSemaine: (classe: number, semaine: number) =>
                   [...racine, 'calendrier-epreuves', 'semaine', classe, semaine] as const,
  anonymats:     (session: number) => [...racine, 'anonymats', session] as const,
  mesFeuilles:   (annee?: string) => [...racine, 'mes-feuilles', annee ?? ''] as const,

  deliberations: domaine<DeliberationFilters>('deliberations'),
  membresJury:   (deliberation: number) => [...racine, 'membres-jury', deliberation] as const,
  lignesDelib:   (id: number, classe?: number) =>
                   [...racine, 'deliberations', 'lignes', id, classe ?? 0] as const,
  statsDelib:    (id: number) => [...racine, 'deliberations', 'stats', id] as const,

  grilles:       domaine<unknown>('grilles'),
  seancesType:   (grille: number) => [...racine, 'seances-type', grille] as const,
  edtSemaine:    (classe: number, semaine: number) =>
                   [...racine, 'edt', classe, semaine] as const,
  feuilleAppel:  (seance: number) => [...racine, 'feuille-appel', seance] as const,

  permutationsProf:     (filters: unknown) => [...racine, 'permutations-prof', filters] as const,
  permutationsEtudiant: (filters: unknown) => [...racine, 'permutations-etudiant', filters] as const,

  absences:      domaine<AbsenceFilters>('absences'),
  documents:     domaine<DocumentFilters>('documents'),
  signataires:   (actif?: boolean) => [...racine, 'signataires', actif ?? null] as const,
};

// ═════════════════════════════════════════════════════════════════════════════
// Paramètres
// ═════════════════════════════════════════════════════════════════════════════
export function useParametresIPGEI() {
  return useQuery({ queryKey: ipgeiKeys.parametres, queryFn: parametresApi.courant });
}

export function useParametresIPGEIMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: parametresApi.update,
    onSuccess:  () => qc.invalidateQueries({ queryKey: ipgeiKeys.parametres }),
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// Tableau de bord
// ═════════════════════════════════════════════════════════════════════════════
export function useResumeIPGEI(annee?: string) {
  return useQuery({
    queryKey: ipgeiKeys.tableauBord(annee),
    queryFn:  () => tableauBordApi.resume(annee),
  });
}

export function useAnneesIPGEI(saisissables = false) {
  return useQuery({
    queryKey: [...ipgeiKeys.annees, saisissables] as const,
    queryFn:  () => tableauBordApi.annees(saisissables),
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// Niveaux du cursus
// ═════════════════════════════════════════════════════════════════════════════
export function useNiveauxCursus(actifsSeuls = false) {
  return useQuery({
    queryKey: ipgeiKeys.niveaux(actifsSeuls),
    queryFn:  () => niveauxApi.list(actifsSeuls),
  });
}

/**
 * Niveaux proposables dans un menu déroulant.
 *
 * Remplace la constante `NIVEAUX` : un niveau ajouté au référentiel doit
 * apparaître partout sans retoucher les écrans. Repli sur le cursus d'origine
 * tant que la requête n'a pas répondu, pour qu'un select ne soit jamais vide.
 */
export function useOptionsNiveaux() {
  const { data: niveaux = [] } = useNiveauxCursus(true);
  if (!niveaux.length) return NIVEAUX;
  return niveaux.map(n => ({
    value: n.code,
    label: n.libelle || `${n.code} — ${n.libelle_rang}`,
  }));
}

export function useNiveauMutations() {
  const qc = useQueryClient();
  // Un niveau touche aux classes, aux matières et aux délibérations : tout le
  // module se rafraîchit, pas seulement la liste des niveaux.
  const invalider = () => qc.invalidateQueries({ queryKey: ipgeiKeys.all });

  return {
    create: useMutation({
      mutationFn: (input: NiveauCursusInput) => niveauxApi.create(input),
      onSuccess:  invalider,
    }),
    update: useMutation({
      mutationFn: ({ id, input }: { id: number; input: NiveauCursusInput }) =>
        niveauxApi.update(id, input),
      onSuccess:  invalider,
    }),
    remove: useMutation({ mutationFn: niveauxApi.remove, onSuccess: invalider }),
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// Calendrier
// ═════════════════════════════════════════════════════════════════════════════
export function useSemestres(filters: SemestreFilters = {}) {
  return useQuery({
    queryKey:        ipgeiKeys.semestres.list(filters),
    queryFn:         () => semestresApi.list(filters),
    placeholderData: keepPreviousData,
  });
}

export function useSemestresAll(filters: SemestreFilters = {}) {
  return useQuery({
    queryKey: [...ipgeiKeys.semestres.lists(), 'all', filters],
    queryFn:  () => semestresApi.all(filters),
  });
}

export function useSemaines(semestre: number | null | undefined,
                            classe?: number | null) {
  return useQuery({
    // La classe entre dans la clé : l'état de cohérence en dépend, deux classes
    // d'un même niveau n'ont pas le même verdict sur une semaine donnée.
    queryKey: [...ipgeiKeys.semaines(semestre ?? 0), classe ?? 0],
    queryFn:  () => semestresApi.semaines(semestre as number, classe),
    enabled:  !!semestre,
  });
}

export function useSemestreMutations() {
  const qc = useQueryClient();
  const invalider = () => qc.invalidateQueries({ queryKey: ipgeiKeys.semestres.all });

  return {
    create: useMutation({
      mutationFn: (input: Partial<SemestreIPGEI>) => semestresApi.create(input),
      onSuccess:  invalider,
    }),
    update: useMutation({
      mutationFn: ({ id, input }: { id: number; input: Partial<SemestreIPGEI> }) =>
        semestresApi.update(id, input),
      onSuccess:  invalider,
    }),
    remove: useMutation({ mutationFn: semestresApi.remove, onSuccess: invalider }),
    cloturer: useMutation({ mutationFn: semestresApi.cloturer, onSuccess: invalider }),
    // Ouvrir une année crée des semestres, donc des lignes de note pour les
    // inscrits : tout le module se rafraîchit, pas seulement le calendrier.
    creerAnnee: useMutation({
      mutationFn: semestresApi.creerAnnee,
      onSuccess:  () => qc.invalidateQueries({ queryKey: ipgeiKeys.all }),
    }),
    genererSemaines: useMutation({
      mutationFn: ({ id, remplacer }: { id: number; remplacer?: boolean }) =>
        semestresApi.genererSemaines(id, remplacer ?? false),
      onSuccess:  (_, vars) => {
        invalider();
        qc.invalidateQueries({ queryKey: ipgeiKeys.semaines(vars.id) });
      },
    }),
  };
}

export function useSemaineMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: Partial<SemaineIPGEI> }) =>
      semainesApi.update(id, input),
    // La semaine porte le type (cours/vacances) : sa modification change ce que
    // la duplication d'EDT va remplir, d'où l'invalidation large.
    onSuccess:  () => qc.invalidateQueries({ queryKey: ipgeiKeys.all }),
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// Classes & sous-groupes
// ═════════════════════════════════════════════════════════════════════════════
export function useClasses(filters: ClasseFilters = {}) {
  return useQuery({
    queryKey:        ipgeiKeys.classes.list(filters),
    queryFn:         () => classesApi.list(filters),
    placeholderData: keepPreviousData,
  });
}

export function useClassesSelect(filters: ClasseFilters = {}) {
  return useQuery({
    queryKey: ipgeiKeys.classesSelect(filters),
    queryFn:  () => classesApi.select(filters),
  });
}

export function useClasse(id: number | null | undefined) {
  return useQuery({
    queryKey: ipgeiKeys.classes.detail(id ?? 0),
    queryFn:  () => classesApi.retrieve(id as number),
    enabled:  id != null,
  });
}

export function useEtudiantsClasse(classe: number | null | undefined) {
  return useQuery({
    queryKey: [...ipgeiKeys.classes.detail(classe ?? 0), 'etudiants'],
    queryFn:  () => classesApi.etudiants(classe as number),
    enabled:  classe != null,
  });
}

export function useClasseMutations() {
  const qc = useQueryClient();
  const invalider = () => qc.invalidateQueries({ queryKey: ipgeiKeys.classes.all });

  return {
    create: useMutation({ mutationFn: (input: ClasseInput) => classesApi.create(input), onSuccess: invalider }),
    update: useMutation({
      mutationFn: ({ id, input }: { id: number; input: Partial<ClasseInput> }) =>
        classesApi.update(id, input),
      onSuccess:  invalider,
    }),
    remove: useMutation({ mutationFn: classesApi.remove, onSuccess: invalider }),
  };
}

export function useSousGroupes(classe: number | null | undefined) {
  return useQuery({
    queryKey: ipgeiKeys.sousGroupes(classe ?? 0),
    queryFn:  () => sousGroupesApi.list(classe as number),
    enabled:  classe != null,
  });
}

export function useSousGroupeMutations(classe?: number) {
  const qc = useQueryClient();
  const invalider = () => {
    qc.invalidateQueries({ queryKey: ipgeiKeys.sousGroupes(classe ?? 0) });
    qc.invalidateQueries({ queryKey: ipgeiKeys.classes.all });
  };

  return {
    create: useMutation({
      mutationFn: (input: { classe: number; libelle: string; matieres?: number[] }) =>
        sousGroupesApi.create(input),
      onSuccess:  invalider,
    }),
    update: useMutation({
      mutationFn: ({ id, input }: { id: number; input: { libelle?: string; matieres?: number[] } }) =>
        sousGroupesApi.update(id, input),
      onSuccess:  invalider,
    }),
    remove: useMutation({ mutationFn: sousGroupesApi.remove, onSuccess: invalider }),
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// Inscriptions
// ═════════════════════════════════════════════════════════════════════════════
export function useInscriptions(filters: InscriptionFilters = {}) {
  return useQuery({
    queryKey:        ipgeiKeys.inscriptions.list(filters),
    queryFn:         () => inscriptionsApi.list(filters),
    placeholderData: keepPreviousData,
  });
}

/**
 * Tous les inscrits d'un périmètre, sans pagination.
 *
 * Pour compter, pas pour lister à l'écran : une page de 20 ne dirait pas
 * combien de copies un devoir surveillé produit. `filtres` omis, rien n'est
 * demandé — c'est ce qui permet de ne pas charger la promotion entière quand
 * le compte vient d'ailleurs.
 */
export function useInscriptionsAll(filtres?: InscriptionFilters) {
  return useQuery({
    queryKey: [...ipgeiKeys.inscriptions.all, 'tous', filtres ?? null] as const,
    queryFn:  () => inscriptionsApi.all(filtres as InscriptionFilters),
    enabled:  filtres != null,
  });
}

export function useInscription(id: number | null | undefined) {
  return useQuery({
    queryKey: ipgeiKeys.inscriptions.detail(id ?? 0),
    queryFn:  () => inscriptionsApi.retrieve(id as number),
    enabled:  id != null,
  });
}

export function useReleveSemestre(inscription: number | null, semestre: number | null) {
  return useQuery({
    queryKey: [...ipgeiKeys.inscriptions.detail(inscription ?? 0), 'releve', semestre ?? 0],
    queryFn:  () => inscriptionsApi.releveSemestre(inscription as number, semestre as number),
    enabled:  inscription != null && semestre != null,
  });
}

export function useReleveAnnuel(inscription: number | null) {
  return useQuery({
    queryKey: [...ipgeiKeys.inscriptions.detail(inscription ?? 0), 'releve-annuel'],
    queryFn:  () => inscriptionsApi.releveAnnuel(inscription as number),
    enabled:  inscription != null,
  });
}

/**
 * Tout le parcours d'un étudiant : ses inscriptions année par année.
 *
 * Sans filtre d'année, volontairement — un relevé annuel ne porte que les
 * semestres de SON année, et consulter un deuxième année sur S3/S4 laissait
 * croire que S1 et S2 n'existaient pas. Ils sont dans l'inscription de l'année
 * précédente.
 */
export function useParcoursEtudiant(matricule: string | null) {
  return useQuery({
    queryKey: [...ipgeiKeys.inscriptions.all, 'parcours', matricule ?? ''] as const,
    queryFn:  () => inscriptionsApi.all({ search: matricule as string }),
    enabled:  !!matricule,
  });
}

/**
 * Les relevés annuels de plusieurs inscriptions, en parallèle.
 *
 * `useQueries` et non une boucle de `useReleveAnnuel` : le nombre d'années
 * varie d'un étudiant à l'autre, et appeler un hook dans une boucle romprait
 * l'ordre des hooks au premier changement de sélection.
 */
export function useRelevesAnnuels(inscriptions: number[]) {
  return useQueries({
    queries: inscriptions.map(id => ({
      queryKey: [...ipgeiKeys.inscriptions.detail(id), 'releve-annuel'],
      queryFn:  () => inscriptionsApi.releveAnnuel(id),
    })),
  });
}

export function useHistoriqueClasses(inscription: number | null) {
  return useQuery({
    queryKey: [...ipgeiKeys.inscriptions.detail(inscription ?? 0), 'historique'],
    queryFn:  () => inscriptionsApi.historique(inscription as number),
    enabled:  inscription != null,
  });
}

export function useAbsencesEtudiant(inscription: number | null, semestre?: number) {
  return useQuery({
    queryKey: [...ipgeiKeys.inscriptions.detail(inscription ?? 0), 'absences', semestre ?? 0],
    queryFn:  () => inscriptionsApi.absences(inscription as number, semestre),
    enabled:  inscription != null,
  });
}

/**
 * Répartition d'inscrits entre classes.
 *
 * Invalide TOUT le module : le mouvement touche les effectifs, les listes
 * d'appel et l'emploi du temps, pas seulement la liste des inscriptions.
 */
export function useRepartition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ mouvements, motif }: {
      mouvements: { inscription: number; classe: number }[]; motif?: string;
    }) => inscriptionsApi.repartir(mouvements, motif),
    onSuccess: () => qc.invalidateQueries({ queryKey: ipgeiKeys.all }),
  });
}

export function useRecalculFrais() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ annee, classe }: { annee: string; classe?: number }) =>
      inscriptionsApi.recalculerFrais(annee, classe),
    onSuccess: () => qc.invalidateQueries({ queryKey: ipgeiKeys.inscriptions.all }),
  });
}

export function useInscriptionMutations() {
  const qc = useQueryClient();
  const invalider = () => {
    qc.invalidateQueries({ queryKey: ipgeiKeys.inscriptions.all });
    // L'effectif affiché sur la classe bouge avec chaque inscription.
    qc.invalidateQueries({ queryKey: ipgeiKeys.classes.all });
  };

  return {
    create: useMutation({ mutationFn: inscriptionsApi.create, onSuccess: invalider }),
    // L'affectation change la classe : le département de l'étudiant suit, donc
    // les listes d'appel aussi. On invalide large.
    affecter: useMutation({
      mutationFn: ({ id, classe }: { id: number; classe: number }) =>
        inscriptionsApi.affecter(id, classe),
      onSuccess: () => qc.invalidateQueries({ queryKey: ipgeiKeys.all }),
    }),
    // Les sous-groupes d'une classe : la classe ne change pas, mais le
    // département de l'étudiant suit le groupe — donc les listes d'appel et les
    // séances dédoublées. On invalide large, comme pour l'affectation.
    affecterGroupes: useMutation({
      mutationFn: (affectations: { inscription: number; sous_groupe: number | null }[]) =>
        inscriptionsApi.affecterGroupes(affectations),
      onSuccess: () => qc.invalidateQueries({ queryKey: ipgeiKeys.all }),
    }),
    // Inscription complète : c'est le chemin normal d'une rentrée, l'étudiant
    // pouvant être créé au passage.
    nouvelle: useMutation({
      mutationFn: (input: InscriptionComplete) => inscriptionsApi.nouvelle(input),
      onSuccess:  invalider,
    }),
    update: useMutation({
      mutationFn: ({ id, input }: { id: number; input: Record<string, unknown> }) =>
        inscriptionsApi.update(id, input),
      onSuccess:  invalider,
    }),
    remove: useMutation({ mutationFn: inscriptionsApi.remove, onSuccess: invalider }),
    payer:  useMutation({
      mutationFn: ({ id, input }: {
        id: number; input: { recu_paiement: string; date_paiement?: string };
      }) => inscriptionsApi.payer(id, input),
      onSuccess: invalider,
    }),
    initialiserNotes: useMutation({
      mutationFn: ({ id, semestre }: { id: number; semestre: number }) =>
        inscriptionsApi.initialiserNotes(id, semestre),
      onSuccess:  () => qc.invalidateQueries({ queryKey: ipgeiKeys.notes.all }),
    }),
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// Matières
// ═════════════════════════════════════════════════════════════════════════════
export function useMatieres(filters: MatiereFilters = {}) {
  return useQuery({
    queryKey:        ipgeiKeys.matieres.list(filters),
    queryFn:         () => matieresApi.list(filters),
    placeholderData: keepPreviousData,
  });
}

export function useMatieresSelect(filters: MatiereFilters = {}) {
  return useQuery({
    queryKey: ipgeiKeys.matieresSelect(filters),
    queryFn:  () => matieresApi.select(filters),
  });
}

/**
 * Toutes les matières d'un filtre, sans pagination — la forme COMPLÈTE.
 *
 * `useMatieresSelect` ne rend qu'un extrait (code, coefficient, volumes) : il
 * ne porte pas `partage_avec`, dont l'écran des matières a besoin pour proposer
 * les enseignements auxquels se rattacher.
 */
export function useMatieresCompletes(filters: MatiereFilters = {}, actif = true) {
  return useQuery({
    queryKey: [...ipgeiKeys.matieres.lists(), 'completes', filters] as const,
    queryFn:  () => matieresApi.all(filters),
    enabled:  actif,
  });
}

/**
 * Les dérogations de pondération — une matière comptée autrement pour une
 * classe.
 *
 * Elles invalident les MATIÈRES et les NOTES : la grille de saisie annonce la
 * pondération applicable, et elle change avec la dérogation.
 */
export function usePonderationsClasse(filters: { matiere?: number; classe?: number } = {}) {
  return useQuery({
    queryKey: [...ipgeiKeys.all, 'ponderations-classe', filters] as const,
    queryFn:  () => ponderationsClasseApi.list(filters),
  });
}

export function usePonderationClasseMutations() {
  const qc = useQueryClient();
  const invalider = () => {
    qc.invalidateQueries({ queryKey: [...ipgeiKeys.all, 'ponderations-classe'] });
    qc.invalidateQueries({ queryKey: ipgeiKeys.matieres.all });
    // La grille de notes sert la pondération applicable : elle doit la relire.
    qc.invalidateQueries({ queryKey: [...ipgeiKeys.all, 'notes'] });
  };
  return {
    create: useMutation({ mutationFn: ponderationsClasseApi.create, onSuccess: invalider }),
    update: useMutation({
      mutationFn: ({ id, input }: { id: number; input: Parameters<typeof ponderationsClasseApi.update>[1] }) =>
        ponderationsClasseApi.update(id, input),
      onSuccess: invalider,
    }),
    remove: useMutation({ mutationFn: ponderationsClasseApi.remove, onSuccess: invalider }),
  };
}

export function useMatiereMutations() {
  const qc = useQueryClient();
  // Changer une pondération n'altère aucune note déjà calculée (snapshot), mais
  // change ce que la prochaine saisie appliquera : on rafraîchit les deux.
  const invalider = () => {
    qc.invalidateQueries({ queryKey: ipgeiKeys.matieres.all });
    qc.invalidateQueries({ queryKey: ipgeiKeys.notes.all });
  };

  return {
    create: useMutation({ mutationFn: (input: MatiereInput) => matieresApi.create(input), onSuccess: invalider }),
    update: useMutation({
      mutationFn: ({ id, input }: { id: number; input: MatiereInput }) => matieresApi.update(id, input),
      onSuccess:  invalider,
    }),
    remove: useMutation({ mutationFn: matieresApi.remove, onSuccess: invalider }),
    reinitialiserPonderation: useMutation({
      mutationFn: matieresApi.reinitialiserPonderation, onSuccess: invalider,
    }),
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// Notes
// ═════════════════════════════════════════════════════════════════════════════
export function useGrilleNotes(
  classe: number | null, matiere: number | null, semestre: number | null,
) {
  return useQuery({
    queryKey: ipgeiKeys.grilleNotes(classe ?? 0, matiere ?? 0, semestre ?? 0),
    queryFn:  () => notesApi.grille(classe as number, matiere as number, semestre as number),
    enabled:  classe != null && matiere != null && semestre != null,
  });
}

export function useSessions(annee?: string) {
  return useQuery({
    queryKey: ipgeiKeys.sessions(annee),
    queryFn:  () => sessionsApi.list(annee),
    enabled:  !!annee,
  });
}

export function useSessionMutations() {
  const qc = useQueryClient();
  // Ouvrir ou clôturer une campagne change ce que la grille de notes autorise :
  // les deux domaines s'invalident ensemble, sans quoi l'écran de saisie
  // continuerait d'afficher un verrou levé une seconde plus tôt.
  const invalider = () => {
    qc.invalidateQueries({ queryKey: [...ipgeiKeys.all, 'sessions'] });
    qc.invalidateQueries({ queryKey: ipgeiKeys.notes.all });
  };

  return {
    ouvrir:   useMutation({ mutationFn: sessionsApi.ouvrir,   onSuccess: invalider }),
    cloturer: useMutation({ mutationFn: sessionsApi.cloturer, onSuccess: invalider }),
    rouvrir:  useMutation({ mutationFn: sessionsApi.rouvrir,  onSuccess: invalider }),
    plafond:  useMutation({
      mutationFn: ({ id, valeur }: { id: number; valeur: string | null }) =>
        sessionsApi.plafond(id, valeur),
      onSuccess: invalider,
    }),
    dates: useMutation({
      mutationFn: ({ id, input }: { id: number; input: Partial<SessionEvaluationIPGEI> }) =>
        sessionsApi.update(id, input),
      onSuccess: invalider,
    }),
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// Épreuves
// ═════════════════════════════════════════════════════════════════════════════
export function useCalendrierEpreuves(filters: EpreuveFilters = {}, actif = true) {
  return useQuery({
    queryKey: ipgeiKeys.calendrierEpreuves(filters),
    queryFn:  () => epreuvesApi.list(filters),
    enabled:  actif,
  });
}

/**
 * Les épreuves à poser en surimpression sur la grille d'une semaine.
 *
 * Séparé de `useEpreuves` : ce que rend le serveur ici porte en plus le jour et
 * les créneaux recouverts, calculés par lui. Mêler les deux dans un seul cache
 * ferait servir des lignes sans ces champs à l'écran qui les attend.
 */
export function useEpreuvesSemaine(classe: number | null | undefined,
                                   semaine: number | null | undefined) {
  return useQuery({
    queryKey: ipgeiKeys.epreuvesSemaine(classe ?? 0, semaine ?? 0),
    queryFn:  () => epreuvesApi.semaine(classe as number, semaine as number),
    enabled:  classe != null && semaine != null,
  });
}

export function useEpreuveMutations() {
  const qc = useQueryClient();
  // L'emploi du temps affiche les épreuves en surimpression : déplacer un
  // examen doit redessiner la grille, sans quoi l'écran garde un bandeau à
  // l'ancienne heure.
  const invalider = () => {
    qc.invalidateQueries({ queryKey: [...ipgeiKeys.all, 'calendrier-epreuves'] });
    qc.invalidateQueries({ queryKey: [...ipgeiKeys.all, 'edt'] });
  };

  return {
    creer:     useMutation({ mutationFn: epreuvesApi.create, onSuccess: invalider }),
    modifier:  useMutation({
      mutationFn: ({ id, input }: { id: number; input: EpreuveInput }) =>
        epreuvesApi.update(id, input),
      onSuccess: invalider,
    }),
    supprimer: useMutation({ mutationFn: epreuvesApi.remove, onSuccess: invalider }),
  };
}

export function useMesFeuilles(annee?: string) {
  return useQuery({
    queryKey: ipgeiKeys.mesFeuilles(annee),
    queryFn:  () => notesApi.mesFeuilles(annee),
    enabled:  !!annee,
  });
}

export function useAnonymats(session: number | null | undefined) {
  return useQuery({
    queryKey: ipgeiKeys.anonymats(session ?? 0),
    queryFn:  () => sessionsApi.anonymats(session as number),
    enabled:  session != null,
  });
}

/**
 * Pièces du secrétariat autour de l'anonymat.
 *
 * Deux documents que rien ne doit confondre : la LISTE porte le couple
 * numéro ↔ matricule et reste au secrétariat ; la RÉPARTITION ne porte que des
 * numéros et accompagne les copies chez le correcteur.
 */
export function useSecretariatAnonymat() {
  return {
    exporter: useMutation({
      mutationFn: ({ session, niveau, sortie }:
                   { session: number; niveau?: string; sortie?: 'excel' | 'pdf' }) =>
        sessionsApi.exportSecretariat(session, niveau, sortie ?? 'excel'),
    }),
    apercu: useMutation({
      mutationFn: ({ session, lots, niveau, matiere, epreuve }:
                   { session: number; lots: LotCorrection[]; niveau?: string;
                     matiere?: number; epreuve?: EpreuveChoisie }) =>
        sessionsApi.apercuRepartition(session, lots, niveau, matiere, epreuve),
    }),
    repartir: useMutation({
      mutationFn: ({ session, lots, niveau, matiere, sortie, epreuve }:
                   { session: number; lots: LotCorrection[]; niveau?: string;
                     matiere?: number; sortie?: 'pdf' | 'excel';
                     epreuve?: EpreuveChoisie }) =>
        sessionsApi.repartitionPdf(session, lots, niveau, matiere,
                                   sortie ?? 'pdf', epreuve),
    }),
  };
}

/**
 * Les épreuves de la matière qui ont EU LIEU, d'après le pointage du Suivi.
 *
 * Rien n'est demandé tant que la matière n'est pas choisie : le pointage se
 * rattache à un enseignement, « toutes matières confondues » n'a pas de sens.
 */
export function useEpreuvesTenues(session?: number | null, matiere?: number | null) {
  return useQuery({
    queryKey: [...ipgeiKeys.all, 'epreuves-tenues', session ?? 0, matiere ?? 0] as const,
    queryFn:  () => sessionsApi.epreuvesTenues(session as number, matiere as number),
    enabled:  session != null && matiere != null,
  });
}

export function useAnonymatMutations(session?: number) {
  const qc = useQueryClient();
  const invalider = () => qc.invalidateQueries({ queryKey: ipgeiKeys.anonymats(session ?? 0) });

  return {
    generer: useMutation({
      mutationFn: ({ id, regenerer, force }: {
        id: number; regenerer?: boolean; force?: boolean;
      }) => sessionsApi.genererAnonymats(id, { regenerer, force }),
      onSuccess: invalider,
    }),
    // Une saisie anonyme change les moyennes : les grilles nominatives doivent
    // se rafraîchir, mais la table de correspondance, elle, n'a pas bougé.
    saisir: useMutation({
      mutationFn: (input: SaisieAnonyme) => notesApi.saisieAnonyme(input),
      onSuccess:  () => qc.invalidateQueries({ queryKey: ipgeiKeys.notes.all }),
    }),
  };
}

export function useNoteMutations() {
  const qc = useQueryClient();
  const invalider = () => qc.invalidateQueries({ queryKey: ipgeiKeys.notes.all });

  return {
    saisieCollective: useMutation({
      mutationFn: (input: SaisieCollective) => notesApi.saisieCollective(input),
      onSuccess:  invalider,
    }),
    update: useMutation({
      mutationFn: ({ id, input }: { id: number; input: Partial<Note> }) => notesApi.update(id, input),
      onSuccess:  invalider,
    }),
    recalculer: useMutation({ mutationFn: notesApi.recalculer, onSuccess: invalider }),
    recalculerLot: useMutation({
      mutationFn: ({ semestre, classe }: { semestre: number; classe?: number }) =>
        notesApi.recalculerLot(semestre, classe),
      onSuccess:  invalider,
    }),
  };
}

/**
 * Feuille de correction sous anonymat : un numéro par ligne, la note en regard.
 *
 * `enabled` sur la matière : sans elle le serveur ne saurait pas quelle épreuve
 * corriger, et la requête partirait pour rien.
 */
export function useGrilleAnonyme(filtres: Partial<FiltresGrilleAnonyme>) {
  const { semestre, matiere, type_evaluation, numero } = filtres;
  return useQuery({
    queryKey: [...ipgeiKeys.notes.all, 'grille-anonyme',
               semestre ?? 0, matiere ?? 0, type_evaluation ?? 'ds', numero ?? 1] as const,
    queryFn:  () => notesApi.grilleAnonyme({
      semestre: semestre as number, matiere: matiere as number,
      type_evaluation, numero,
    }),
    enabled:  !!semestre && !!matiere,
  });
}

export function useSaisieAnonymeLot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SaisieAnonymeLot) => notesApi.saisieAnonymeLot(input),
    // Les moyennes changent : toute lecture de notes est périmée.
    onSuccess:  () => qc.invalidateQueries({ queryKey: ipgeiKeys.notes.all }),
  });
}

/**
 * Édition d'une fiche de collecte — un téléchargement, pas une écriture.
 *
 * En `useMutation` et non `useQuery` : le document se produit sur demande
 * expresse, et rien ne doit le régénérer au remontage de l'écran.
 */
export function useFicheCollecte() {
  return useMutation({
    mutationFn: (filtres: FiltresCollecte) => notesApi.ficheCollecte(filtres),
  });
}

export function useFicheEmargement() {
  return useMutation({
    mutationFn: (filtres: FiltresEmargement) => notesApi.ficheEmargement(filtres),
  });
}

/**
 * Import d'un classeur de collecte rempli.
 *
 * Invalide TOUT le domaine : un import touche les notes, donc les moyennes,
 * les rangs et l'avancement de la saisie. Ne rafraîchir que la grille
 * laisserait les autres écrans afficher l'état d'avant.
 */
export function useImportNotes() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof notesApi.importerNotes>[0]) =>
      notesApi.importerNotes(input),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ipgeiKeys.all }),
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// Délibération
// ═════════════════════════════════════════════════════════════════════════════
export function useDeliberations(filters: DeliberationFilters = {}) {
  return useQuery({
    queryKey:        ipgeiKeys.deliberations.list(filters),
    queryFn:         () => deliberationsApi.list(filters),
    placeholderData: keepPreviousData,
  });
}

export function useDeliberation(id: number | null | undefined) {
  return useQuery({
    queryKey: ipgeiKeys.deliberations.detail(id ?? 0),
    queryFn:  () => deliberationsApi.retrieve(id as number),
    enabled:  id != null,
  });
}

export function useLignesDeliberation(id: number | null | undefined, classe?: number) {
  return useQuery({
    queryKey: ipgeiKeys.lignesDelib(id ?? 0, classe),
    queryFn:  () => deliberationsApi.lignes(id as number, classe),
    enabled:  id != null,
  });
}

/** Aperçu du passage : qui repart, vers quel niveau, qui est déjà inscrit. */
export function useApercuPassage(id: number | null | undefined, actif = true) {
  return useQuery({
    queryKey: [...ipgeiKeys.deliberations.all, 'passage', id ?? 0] as const,
    queryFn:  () => deliberationsApi.passageApercu(id as number),
    enabled:  id != null && actif,
  });
}

export function useStatistiquesDeliberation(id: number | null | undefined) {
  return useQuery({
    queryKey: ipgeiKeys.statsDelib(id ?? 0),
    queryFn:  () => deliberationsApi.statistiques(id as number),
    enabled:  id != null,
  });
}

export function useDeliberationMutations() {
  const qc = useQueryClient();
  const invalider = () => qc.invalidateQueries({ queryKey: ipgeiKeys.deliberations.all });
  // Valider un jury verrouille les notes et change le statut des inscriptions :
  // tout le module doit se rafraîchir, pas seulement l'écran du jury.
  const invaliderTout = () => qc.invalidateQueries({ queryKey: ipgeiKeys.all });

  return {
    create: useMutation({
      mutationFn: (input: Partial<Deliberation>) => deliberationsApi.create(input),
      onSuccess:  invalider,
    }),
    update: useMutation({
      mutationFn: ({ id, input }: { id: number; input: Partial<Deliberation> }) =>
        deliberationsApi.update(id, input),
      onSuccess:  invalider,
    }),
    remove:   useMutation({ mutationFn: deliberationsApi.remove,   onSuccess: invalider }),
    // Le seuil accompagne le calcul : le jury essaie une valeur et voit le
    // résultat, sans passer par un formulaire d'édition séparé.
    calculer: useMutation({
      mutationFn: ({ id, seuil }: { id: number; seuil?: string }) =>
        deliberationsApi.calculer(id, seuil),
      onSuccess: invalider,
    }),
    valider:  useMutation({ mutationFn: deliberationsApi.valider,  onSuccess: invaliderTout }),
    // Le second jury est une délibération de plus : la liste doit la voir
    // apparaître, et le jury annuel savoir qu'il l'a désormais.
    pvFinal: useMutation({
      mutationFn: ({ id, sortie }: { id: number; sortie: 'pdf' | 'excel' }) =>
        deliberationsApi.pvFinal(id, sortie),
    }),
    ouvrirRattrapage: useMutation({
      mutationFn: deliberationsApi.ouvrirRattrapage, onSuccess: invaliderTout,
    }),
    // Le passage crée des inscriptions sur une AUTRE année : c'est tout le
    // module qui se périme, pas seulement les délibérations.
    passage: useMutation({
      mutationFn: ({ id, niveau }: { id: number; niveau?: string }) =>
        deliberationsApi.passage(id, niveau),
      onSuccess: invaliderTout,
    }),
    // Dévalider touche autant de choses que valider : mêmes invalidations.
    devalider: useMutation({ mutationFn: deliberationsApi.devalider, onSuccess: invaliderTout }),
    ajusterLigne: useMutation({
      mutationFn: ({ id, input }: {
        id: number; input: { decision?: string; motif_ajustement?: string; observations?: string };
      }) => lignesDeliberationApi.update(id, input),
      onSuccess:  invalider,
    }),
    // Les éditions ne modifient rien : pas d'invalidation à leur suite.
    pvPdf:   useMutation({ mutationFn: deliberationsApi.pvPdf }),
    pvExcel: useMutation({ mutationFn: deliberationsApi.pvExcel }),
    detailNotes: useMutation({
      mutationFn: ({ id, tri }: { id: number; tri?: TriDetailNotes }) =>
        deliberationsApi.detailNotes(id, tri),
    }),
  };
}

// ── Jury ─────────────────────────────────────────────────────────────────────
export function useMembresJury(deliberation: number | null | undefined) {
  return useQuery({
    queryKey: ipgeiKeys.membresJury(deliberation ?? 0),
    queryFn:  () => membresJuryApi.list(deliberation as number),
    enabled:  deliberation != null,
  });
}

/**
 * Les comptes pouvant siéger au jury, filtrés côté serveur.
 *
 * `recherche` part au serveur plutôt que de filtrer une page déjà reçue : un
 * établissement compte vite cent comptes, et une liste tronquée à vingt aurait
 * caché la moitié des enseignants sans rien annoncer.
 */
export function useCandidatsJury(deliberation: number | null | undefined,
                                 recherche = '') {
  return useQuery({
    queryKey: [...ipgeiKeys.all, 'candidats-jury', deliberation ?? 0, recherche] as const,
    queryFn:  () => membresJuryApi.candidats(deliberation as number, recherche || undefined),
    enabled:  deliberation != null,
    placeholderData: keepPreviousData,
  });
}

/**
 * Le classement de S3 — aperçu, puis édition.
 *
 * L'aperçu et les deux exports partagent le même calcul côté serveur : ce que
 * l'écran montre est exactement ce que la feuille portera.
 */
export function useClassementS3(annee: string, niveau?: string) {
  return useQuery({
    queryKey: [...ipgeiKeys.all, 'classement-s3', annee, niveau ?? ''] as const,
    queryFn:  () => classementApi.apercu(annee, niveau),
    enabled:  !!annee,
    placeholderData: keepPreviousData,
  });
}

export function useClassementMutations() {
  return {
    exporter: useMutation({
      mutationFn: ({ annee, sortie, niveau }:
                   { annee: string; sortie: 'pdf' | 'excel'; niveau?: string }) =>
        classementApi.exporter(annee, sortie, niveau),
    }),
  };
}

/**
 * La grille de saisie du rattrapage, portée par le jury qui la concerne.
 *
 * Toutes les matières de l'année y figurent : c'est le jury qui décide où l'on
 * repasse, et la règle retenue est `max(session normale, rattrapage)` — une
 * matière repassée sans être améliorée ne fait aucun mal, une matière absente
 * de la grille aurait interdit de la repasser.
 */
export function useGrilleRattrapage(deliberation: number | null | undefined) {
  return useQuery({
    queryKey: [...ipgeiKeys.deliberations.all, 'rattrapage', deliberation ?? 0] as const,
    queryFn:  () => deliberationsApi.grilleRattrapage(deliberation as number),
    enabled:  deliberation != null,
  });
}

export function useSaisieRattrapage(deliberation: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (saisies: SaisieRattrapage[]) =>
      deliberationsApi.saisirRattrapage(deliberation, saisies),
    // Les notes bougent, donc les moyennes, donc les décisions : c'est tout le
    // jury qui se périme, pas la seule grille.
    onSuccess: () => qc.invalidateQueries({ queryKey: ipgeiKeys.all }),
  });
}

/**
 * Le concours CNIM : qui y est autorisé, ce qu'il a obtenu, ce qui en découle.
 *
 * Le résultat vient de l'extérieur — il ne se calcule pas. La conséquence, elle,
 * est mécanique, et c'est pourquoi l'écran la montre avant de l'appliquer.
 */
export function useConcoursCNIM(annee: string, niveau?: string) {
  return useQuery({
    queryKey: [...ipgeiKeys.all, 'concours', annee, niveau ?? ''] as const,
    queryFn:  () => concoursApi.grille(annee, niveau),
    enabled:  !!annee,
    placeholderData: keepPreviousData,
  });
}

export function useConcoursMutations(annee: string, niveau?: string) {
  const qc = useQueryClient();
  // Poser une situation change un statut d'inscription, parfois un compteur de
  // redoublement : c'est tout le module qui se périme.
  const invalider = () => qc.invalidateQueries({ queryKey: ipgeiKeys.all });

  return {
    saisir: useMutation({
      mutationFn: (saisies: { inscription: number; resultat: string }[]) =>
        concoursApi.saisir(saisies),
      onSuccess: invalider,
    }),
    importer: useMutation({
      mutationFn: ({ fichier, definitive }: { fichier: File; definitive: boolean }) =>
        concoursApi.importerAdmis(fichier, annee, niveau, definitive),
      onSuccess: invalider,
    }),
    appliquer: useMutation({
      mutationFn: (apercu: boolean) => concoursApi.appliquer(annee, niveau, apercu),
      onSuccess: (_, apercu) => { if (!apercu) invalider(); },
    }),
    // Éditer le modèle ne change rien : aucune invalidation.
    modele: useMutation({
      mutationFn: () => concoursApi.modele(annee, niveau),
    }),
  };
}

export function useJuryMutations(deliberation?: number) {
  const qc = useQueryClient();
  // Le compte de signatures figure sur la délibération elle-même : les deux
  // domaines se rafraîchissent ensemble.
  const invalider = () => {
    qc.invalidateQueries({ queryKey: ipgeiKeys.membresJury(deliberation ?? 0) });
    qc.invalidateQueries({ queryKey: ipgeiKeys.deliberations.all });
  };

  return {
    ajouter: useMutation({
      mutationFn: (input: { deliberation: number; utilisateur: number; role: RoleJuryIPGEI }) =>
        membresJuryApi.create(input),
      onSuccess: invalider,
    }),
    retirer: useMutation({ mutationFn: membresJuryApi.remove, onSuccess: invalider }),
    signer:  useMutation({ mutationFn: deliberationsApi.signer, onSuccess: invalider }),
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// EDT
// ═════════════════════════════════════════════════════════════════════════════
export function useGrilles(filters: Params = {}) {
  return useQuery({
    queryKey: ipgeiKeys.grilles.list(filters),
    queryFn:  () => grillesApi.list(filters),
  });
}

/**
 * Grille de la classe pour le type de semestre courant. Le backend la crée si
 * elle n'existe pas : l'écran n'a donc jamais d'état « pas encore de grille ».
 */
export function useGrillePourClasse(classe: number | null, typeSemestre: string) {
  return useQuery({
    queryKey: [...ipgeiKeys.grilles.all, 'pour-classe', classe ?? 0, typeSemestre],
    queryFn:  () => grillesApi.pourClasse(classe as number, typeSemestre),
    enabled:  classe != null,
  });
}

export function useGrille(id: number | null | undefined) {
  return useQuery({
    queryKey: ipgeiKeys.grilles.detail(id ?? 0),
    queryFn:  () => grillesApi.retrieve(id as number),
    enabled:  id != null,
  });
}

export function useGrilleMutations() {
  const qc = useQueryClient();
  const invalider = () => {
    qc.invalidateQueries({ queryKey: ipgeiKeys.grilles.all });
    // Dupliquer une grille écrit des séances réelles : les semaines touchées
    // changent d'état, leur verdict de cohérence aussi.
    qc.invalidateQueries({ queryKey: [...ipgeiKeys.all, 'semaines'] });
  };

  return {
    create: useMutation({
      mutationFn: (input: { classe: number; type_semestre: string; libelle?: string }) =>
        grillesApi.create(input),
      onSuccess:  invalider,
    }),
    remove: useMutation({ mutationFn: grillesApi.remove, onSuccess: invalider }),
    /**
     * Reprend une semaine dans le patron — le sens inverse de `dupliquer`.
     *
     * Invalide la grille ET les séances : le patron change, et l'écran qui
     * l'affiche doit le relire.
     */
    reprendreSemaine: useMutation({
      mutationFn: ({ id, input }: {
        id: number; input: { semaine: number; ecraser?: boolean };
      }) => grillesApi.reprendreSemaine(id, input),
      onSuccess: invalider,
    }),

    /**
     * Recopie une semaine réelle vers d'autres.
     *
     * Vit avec les mutations de grille, et non à part : les deux duplications
     * touchent les mêmes données et doivent invalider les mêmes caches. Les
     * séparer aurait laissé l'une rafraîchir l'écran et pas l'autre.
     */
    dupliquerSemaine: useMutation({
      mutationFn: seancesApi.dupliquerSemaine,
      onSuccess:  () => {
        qc.invalidateQueries({ queryKey: [...ipgeiKeys.all, 'edt'] });
        qc.invalidateQueries({ queryKey: [...ipgeiKeys.all, 'semaines'] });
      },
    }),
    dupliquer: useMutation({
      mutationFn: ({ id, input }: {
        id: number;
        input: { semestre: number; semaine_debut?: number | null; nb_semaines?: number; ecraser?: boolean };
      }) => grillesApi.dupliquer(id, input),
      // La duplication crée des séances réelles : c'est l'EDT hebdo qui bouge,
      // et avec lui le verdict de cohérence de chaque semaine touchée.
      onSuccess:  () => {
        qc.invalidateQueries({ queryKey: [...ipgeiKeys.all, 'edt'] });
        qc.invalidateQueries({ queryKey: [...ipgeiKeys.all, 'semaines'] });
      },
    }),
    createSeance: useMutation({
      mutationFn: (input: Partial<SeanceType>) => seancesTypeApi.create(input),
      onSuccess:  invalider,
    }),
    updateSeance: useMutation({
      mutationFn: ({ id, input }: { id: number; input: Partial<SeanceType> }) =>
        seancesTypeApi.update(id, input),
      onSuccess:  invalider,
    }),
    removeSeance: useMutation({ mutationFn: seancesTypeApi.remove, onSuccess: invalider }),
  };
}

/**
 * Créneaux déjà mobilisés par les autres classes.
 *
 * C'est ce qui permet à la grille de ne proposer qu'un enseignant réellement
 * libre : sa liste locale ne connaît que la classe affichée, et deux classes
 * saisies l'une après l'autre pouvaient retenir la même personne.
 */
export function useOccupationCreneaux(
  classe: number | null, semaine: number | null, typeSemestre: string,
) {
  return useQuery({
    queryKey: [...ipgeiKeys.all, 'edt', 'occupation',
               classe ?? 0, semaine ?? 0, typeSemestre] as const,
    queryFn:  () => seancesApi.occupation({
      classe: classe as number, semaine, type_semestre: typeSemestre,
    }),
    enabled:  classe != null,
  });
}

/** Prises de vue archivées d'une classe, de la plus récente à la plus ancienne. */
export function useVersionsArchive(classe: number | null, semestre?: number | null) {
  return useQuery({
    queryKey: [...ipgeiKeys.all, 'archives', 'versions', classe ?? 0, semestre ?? 0] as const,
    queryFn:  () => archivesEdtApi.versions(classe as number, semestre),
    enabled:  classe != null,
  });
}

/**
 * Emploi du temps **publié** d'une semaine.
 *
 * C'est la source des écrans de consultation : ce que voient les étudiants et
 * les enseignants est la version qui a servi à générer le suivi, pas la grille
 * en cours de préparation. Générer le suivi est l'acte qui publie — un seul
 * geste pour les étudiants et pour la paie, au lieu de deux qu'on pouvait
 * oublier d'accorder.
 *
 * `cible` désigne l'axe : classe, enseignant ou salle.
 */
export function useEdtPublie(
  semaine: number | null,
  cible: { classe?: number | null; prof?: number | null; salle?: number | null },
  version?: number | null,
) {
  const { classe = null, prof = null, salle = null } = cible;
  return useQuery({
    queryKey: [...ipgeiKeys.all, 'archives', 'grille', semaine ?? 0,
               classe ?? 0, prof ?? 0, salle ?? 0, version ?? 0] as const,
    queryFn:  () => archivesEdtApi.grille({
      semaine: semaine as number, classe, prof, salle, version,
    }),
    enabled:  semaine != null && (classe != null || prof != null || salle != null),
  });
}

/** Séances d'une prise de vue précise — écran d'historique. */
export function useGrilleArchive(
  semaine: number | null, classe: number | null, version: number | null,
) {
  return useEdtPublie(semaine, { classe }, version);
}

export function useEdtSemaine(classe: number | null, semaine: number | null) {
  return useQuery({
    queryKey: ipgeiKeys.edtSemaine(classe ?? 0, semaine ?? 0),
    queryFn:  () => seancesApi.parSemaine(classe as number, semaine as number),
    enabled:  classe != null && semaine != null,
  });
}

export function useSeanceMutations() {
  const qc = useQueryClient();
  // L'état de cohérence d'une semaine — « à jour » ou « divergent » — se calcule
  // au serveur à partir du contenu de l'emploi du temps. Toucher une séance le
  // périme donc, et il vit dans la liste des semaines, pas sous la clé « edt » :
  // sans cette seconde invalidation, le bandeau continuait d'afficher le verdict
  // d'avant la modification.
  const invalider = () => {
    qc.invalidateQueries({ queryKey: [...ipgeiKeys.all, 'edt'] });
    qc.invalidateQueries({ queryKey: [...ipgeiKeys.all, 'semaines'] });
  };

  return {
    create: useMutation({
      mutationFn: (input: Partial<SeanceReelle>) => seancesApi.create(input),
      onSuccess:  invalider,
    }),
    update: useMutation({
      mutationFn: ({ id, input }: { id: number; input: Partial<SeanceReelle> }) =>
        seancesApi.update(id, input),
      onSuccess:  invalider,
    }),
    remove: useMutation({ mutationFn: seancesApi.remove, onSuccess: invalider }),
    appliquerLot: useMutation({
      mutationFn: ({ id, input }: {
        id: number;
        input: { nb_semaines: number; prof?: number | null; salle?: number | null;
                 matiere?: number | null; annulee?: boolean };
      }) => seancesApi.appliquerLot(id, input),
      onSuccess:  invalider,
    }),
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// Absences
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Les ÉPREUVES d'un semestre — devoirs surveillés et examens finaux.
 *
 * Le filtre porte sur le libellé du référentiel « Paramètres → Séances » et
 * non sur des identifiants : ceux-ci diffèrent d'une base à l'autre, et cette
 * liste doit rester juste après une réinstallation.
 *
 * C'est de ces séances que vient l'émargement, et de l'émargement que vient
 * le « ABS » porté sur les fiches de collecte.
 */
export function useEpreuves(filtres: {
  semestre?: number | null; classe?: number | null; matiere?: number | null;
}) {
  const params = {
    'semaine__semestre':          filtres.semestre ?? undefined,
    classe:                       filtres.classe ?? undefined,
    matiere:                      filtres.matiere ?? undefined,
    'type_seance__type_seance__in': 'EF,DS',
  };
  return useQuery({
    queryKey: [...ipgeiKeys.all, 'epreuves', params] as const,
    queryFn:  () => seancesApi.list(params),
    enabled:  filtres.semestre != null,
  });
}

export function useFeuilleAppel(seance: number | null | undefined) {
  return useQuery({
    queryKey: ipgeiKeys.feuilleAppel(seance ?? 0),
    queryFn:  () => seancesApi.feuilleAppel(seance as number),
    enabled:  seance != null,
  });
}

export function useAbsences(filters: AbsenceFilters = {}) {
  return useQuery({
    queryKey:        ipgeiKeys.absences.list(filters),
    queryFn:         () => absencesApi.list(filters),
    placeholderData: keepPreviousData,
  });
}

export function useAbsenceMutations() {
  const qc = useQueryClient();
  const invalider = () => {
    qc.invalidateQueries({ queryKey: ipgeiKeys.absences.all });
    qc.invalidateQueries({ queryKey: [...ipgeiKeys.all, 'feuille-appel'] });
  };

  return {
    saisir: useMutation({
      mutationFn: ({ seance, absents }: {
        seance: number;
        absents: { inscription: number; statut: StatutAbsence; justificatif?: string }[];
      }) => seancesApi.saisirAbsences(seance, absents),
      onSuccess:  invalider,
    }),
    update: useMutation({
      mutationFn: ({ id, input }: { id: number; input: Record<string, unknown> }) =>
        absencesApi.update(id, input),
      onSuccess:  invalider,
    }),
    remove: useMutation({ mutationFn: absencesApi.remove, onSuccess: invalider }),
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// Permutations
// ═════════════════════════════════════════════════════════════════════════════
export function usePermutationsProf(filters: Params = {}) {
  return useQuery({
    queryKey:        ipgeiKeys.permutationsProf(filters),
    queryFn:         () => permutationsProfApi.list(filters),
    placeholderData: keepPreviousData,
  });
}

export function usePermutationsEtudiant(filters: Params = {}) {
  return useQuery({
    queryKey:        ipgeiKeys.permutationsEtudiant(filters),
    queryFn:         () => permutationsEtudiantApi.list(filters),
    placeholderData: keepPreviousData,
  });
}

export function usePermutationProfMutations() {
  const qc = useQueryClient();
  // Une permutation appliquée réécrit les séances : on invalide aussi l'EDT.
  const invalider = () => qc.invalidateQueries({ queryKey: ipgeiKeys.all });

  return {
    create:    useMutation({ mutationFn: permutationsProfApi.create,    onSuccess: invalider }),
    permuterMaintenant: useMutation({
      mutationFn: permutationsProfApi.permuterMaintenant, onSuccess: invalider,
    }),
    accorder:  useMutation({ mutationFn: permutationsProfApi.accorder,  onSuccess: invalider }),
    valider:   useMutation({ mutationFn: permutationsProfApi.valider,   onSuccess: invalider }),
    appliquer: useMutation({ mutationFn: permutationsProfApi.appliquer, onSuccess: invalider }),
    refuser:   useMutation({
      mutationFn: ({ id, motif }: { id: number; motif: string }) =>
        permutationsProfApi.refuser(id, motif),
      onSuccess:  invalider,
    }),
    remove:    useMutation({ mutationFn: permutationsProfApi.remove,    onSuccess: invalider }),
  };
}

export function usePermutationEtudiantMutations() {
  const qc = useQueryClient();
  const invalider = () => qc.invalidateQueries({ queryKey: ipgeiKeys.all });

  return {
    create:    useMutation({ mutationFn: permutationsEtudiantApi.create,    onSuccess: invalider }),
    // Le mouvement s'applique d'un geste : la demande est déjà signée sur
    // papier, et le circuit ne ferait que la ressaisir.
    appliquerMaintenant: useMutation({
      mutationFn: permutationsEtudiantApi.appliquerMaintenant, onSuccess: invalider,
    }),
    formulaire: useMutation({ mutationFn: permutationsEtudiantApi.formulaire }),
    accorder:  useMutation({ mutationFn: permutationsEtudiantApi.accorder,  onSuccess: invalider }),
    valider:   useMutation({ mutationFn: permutationsEtudiantApi.valider,   onSuccess: invalider }),
    appliquer: useMutation({ mutationFn: permutationsEtudiantApi.appliquer, onSuccess: invalider }),
    refuser:   useMutation({
      mutationFn: ({ id, motif }: { id: number; motif: string }) =>
        permutationsEtudiantApi.refuser(id, motif),
      onSuccess:  invalider,
    }),
    remove:    useMutation({ mutationFn: permutationsEtudiantApi.remove,    onSuccess: invalider }),
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// Documents
// ═════════════════════════════════════════════════════════════════════════════
export function useDocumentsIPGEI(filters: DocumentFilters = {}) {
  return useQuery({
    queryKey:        ipgeiKeys.documents.list(filters),
    queryFn:         () => documentsApi.list(filters),
    placeholderData: keepPreviousData,
  });
}

/**
 * Édition par groupe : un PDF, tous les élèves d'une classe.
 *
 * Invalide la liste des documents : chaque élève y gagne une pièce numérotée,
 * et le registre doit les montrer sans qu'on ait à recharger l'écran.
 */
export function useDocumentLot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      type_document: string; classe?: number; matricules?: string;
      annee_universitaire?: string; semestre?: number; signataire?: number;
    }) => documentsApi.genererLot(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ipgeiKeys.documents.all }),
  });
}

export function useDocumentMutations() {
  const qc = useQueryClient();
  const invalider = () => qc.invalidateQueries({ queryKey: ipgeiKeys.documents.all });

  return {
    // `signataire` : qui signe la pièce. Omis, le serveur retient le
    // signataire par défaut de l'institution — le comportement d'avant.
    releveSemestre: useMutation({
      mutationFn: ({ inscription, semestre, signataire }:
                   { inscription: number; semestre: number; signataire?: number }) =>
        documentsApi.releveSemestre(inscription, semestre, signataire),
      onSuccess:  invalider,
    }),
    releveAnnuel: useMutation({
      mutationFn: ({ inscription, signataire }:
                   { inscription: number; signataire?: number }) =>
        documentsApi.releveAnnuel(inscription, signataire),
      onSuccess:  invalider,
    }),
    decision: useMutation({
      mutationFn: ({ deliberation, inscription }: { deliberation: number; inscription: number }) =>
        documentsApi.decision(deliberation, inscription),
      onSuccess:  invalider,
    }),
    attestationCnim: useMutation({
      mutationFn: ({ deliberation, inscription, signataire }:
                   { deliberation: number; inscription: number; signataire?: number }) =>
        documentsApi.attestationCnim(deliberation, inscription, signataire),
      onSuccess:  invalider,
    }),
    attestationReussite: useMutation({
      mutationFn: ({ deliberation, inscription, signataire }:
                   { deliberation: number; inscription: number; signataire?: number }) =>
        documentsApi.attestationReussite(deliberation, inscription, signataire),
      onSuccess:  invalider,
    }),
    attestationInscription: useMutation({
      mutationFn: ({ inscription, signataire }:
                   { inscription: number; signataire?: number }) =>
        documentsApi.attestationInscription(inscription, signataire),
      onSuccess:  invalider,
    }),
    recuPaiement: useMutation({
      mutationFn: (inscription: number) => documentsApi.recuPaiement(inscription),
      onSuccess:  invalider,
    }),
    decisionsClasse: useMutation({
      mutationFn: ({ deliberation, classe }: { deliberation: number; classe?: number }) =>
        documentsApi.decisionsClasse(deliberation, classe),
      onSuccess:  invalider,
    }),
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// Signataires
// ═════════════════════════════════════════════════════════════════════════════
/**
 * Habilités à signer les documents officiels.
 *
 * Lu à la génération pour proposer qui signe, et au paramétrage pour tenir la
 * liste. La signature reste manuscrite : seul le bloc imprimé change.
 */
export function useSignataires(actif?: boolean) {
  return useQuery({
    queryKey: ipgeiKeys.signataires(actif),
    queryFn:  () => signatairesApi.list(actif === undefined ? {} : { actif }),
  });
}

export function useSignataireMutations() {
  const qc = useQueryClient();
  // Poser un signataire par défaut en retire un autre : toute la liste bouge.
  const invalider = () => qc.invalidateQueries({
    predicate: q => q.queryKey[1] === 'signataires',
  });

  return {
    creer: useMutation({
      mutationFn: (input: Partial<Signataire>) => signatairesApi.create(input),
      onSuccess:  invalider,
    }),
    modifier: useMutation({
      mutationFn: ({ id, ...input }: Partial<Signataire> & { id: number }) =>
        signatairesApi.update(id, input),
      onSuccess:  invalider,
    }),
    desactiver: useMutation({
      mutationFn: (id: number) => signatairesApi.remove(id),
      onSuccess:  invalider,
    }),
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// Sanctions pour fraude
// ═════════════════════════════════════════════════════════════════════════════
export function useFraudes(filters: FraudeFilters = {}) {
  return useQuery({
    queryKey:        [...ipgeiKeys.all, 'fraudes', filters] as const,
    queryFn:         () => fraudesApi.list(filters),
    placeholderData: keepPreviousData,
  });
}

export function useSanctionnables(inscription: number | null | undefined) {
  return useQuery({
    queryKey: [...ipgeiKeys.all, 'fraudes', 'sanctionnables', inscription ?? 0] as const,
    queryFn:  () => fraudesApi.sanctionnables(inscription as number),
    enabled:  inscription != null,
  });
}

export function useFraudeMutations() {
  const qc = useQueryClient();
  // Tout le module : une sanction change des notes, des moyennes et l'état
  // des jurys qui les ont arrêtées.
  const invalider = () => qc.invalidateQueries({ queryKey: ipgeiKeys.all });
  return {
    create: useMutation({ mutationFn: fraudesApi.create, onSuccess: invalider }),
    lever:  useMutation({ mutationFn: fraudesApi.lever,  onSuccess: invalider }),
  };
}
