/**
 * Hooks TanStack Query du module IPGEI.
 *
 * Une seule factory de clés (`ipgeiKeys`) pour tout le domaine : invalider
 * `ipgeiKeys.all` purge le module entier, `ipgeiKeys.notes.lists()` seulement
 * les grilles de notes. Aucune page ne pose de queryKey à la main.
 */
import {
  keepPreviousData, useMutation, useQuery, useQueryClient,
} from '@tanstack/react-query';

import {
  archivesEdtApi, absencesApi, classesApi, deliberationsApi, documentsApi, grillesApi,
  inscriptionsApi, lignesDeliberationApi, matieresApi, notesApi, parametresApi,
  permutationsEtudiantApi, permutationsProfApi, seancesApi, seancesTypeApi,
  semainesApi, semestresApi, sousGroupesApi, tableauBordApi,
  type AbsenceFilters, type ClasseFilters, type DeliberationFilters, type Params,
  type DocumentFilters, type InscriptionFilters, type MatiereFilters,
  type SemestreFilters,
} from './ipgei';
import type {
  ClasseInput, Deliberation, InscriptionComplete, MatiereInput, Note, SaisieCollective,
  SeanceReelle, SeanceType, SemaineIPGEI, SemestreIPGEI, StatutAbsence,
} from '@/types/ipgei';

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

  deliberations: domaine<DeliberationFilters>('deliberations'),
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

export function useAnneesIPGEI() {
  return useQuery({ queryKey: ipgeiKeys.annees, queryFn: tableauBordApi.annees });
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
    genererSemaines: useMutation({
      mutationFn: ({ id, remplacer, nb }: { id: number; remplacer?: boolean; nb?: number }) =>
        semestresApi.genererSemaines(id, remplacer ?? false, nb),
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

export function useInscriptionMutations() {
  const qc = useQueryClient();
  const invalider = () => {
    qc.invalidateQueries({ queryKey: ipgeiKeys.inscriptions.all });
    // L'effectif affiché sur la classe bouge avec chaque inscription.
    qc.invalidateQueries({ queryKey: ipgeiKeys.classes.all });
  };

  return {
    create: useMutation({ mutationFn: inscriptionsApi.create, onSuccess: invalider }),
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
    calculer: useMutation({ mutationFn: deliberationsApi.calculer, onSuccess: invalider }),
    valider:  useMutation({ mutationFn: deliberationsApi.valider,  onSuccess: invaliderTout }),
    ajusterLigne: useMutation({
      mutationFn: ({ id, input }: {
        id: number; input: { decision?: string; motif_ajustement?: string; observations?: string };
      }) => lignesDeliberationApi.update(id, input),
      onSuccess:  invalider,
    }),
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

/** Séances d'une prise de vue. Sans `version`, la plus récente. */
export function useGrilleArchive(
  semaine: number | null, classe: number | null, version: number | null,
) {
  return useQuery({
    queryKey: [...ipgeiKeys.all, 'archives', 'grille',
               semaine ?? 0, classe ?? 0, version ?? 0] as const,
    queryFn:  () => archivesEdtApi.grille(semaine as number, classe as number, version),
    enabled:  semaine != null && classe != null,
  });
}

export function useEdtSemaine(classe: number | null, semaine: number | null) {
  return useQuery({
    queryKey: ipgeiKeys.edtSemaine(classe ?? 0, semaine ?? 0),
    queryFn:  () => seancesApi.parSemaine(classe as number, semaine as number),
    enabled:  classe != null && semaine != null,
  });
}

/**
 * EDT d'un enseignant sur une semaine — toutes classes confondues.
 *
 * Après une permutation, `prof` porte l'enseignant EFFECTIF de la semaine :
 * cette vue montre donc ce que l'intéressé assure réellement, pas ce qui était
 * initialement prévu.
 */
export function useEdtParProf(prof: number | null, semaine: number | null) {
  return useQuery({
    queryKey: [...ipgeiKeys.all, 'edt', 'prof', prof ?? 0, semaine ?? 0],
    queryFn:  () => seancesApi.list({ prof: prof as number, semaine: semaine as number }),
    enabled:  prof != null && semaine != null,
  });
}

/** EDT d'une salle sur une semaine — sert à repérer les créneaux libres. */
export function useEdtParSalle(salle: number | null, semaine: number | null) {
  return useQuery({
    queryKey: [...ipgeiKeys.all, 'edt', 'salle', salle ?? 0, semaine ?? 0],
    queryFn:  () => seancesApi.list({ salle: salle as number, semaine: semaine as number }),
    enabled:  salle != null && semaine != null,
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

export function useDocumentMutations() {
  const qc = useQueryClient();
  const invalider = () => qc.invalidateQueries({ queryKey: ipgeiKeys.documents.all });

  return {
    releveSemestre: useMutation({
      mutationFn: ({ inscription, semestre }: { inscription: number; semestre: number }) =>
        documentsApi.releveSemestre(inscription, semestre),
      onSuccess:  invalider,
    }),
    releveAnnuel: useMutation({
      mutationFn: (inscription: number) => documentsApi.releveAnnuel(inscription),
      onSuccess:  invalider,
    }),
    decision: useMutation({
      mutationFn: ({ deliberation, inscription }: { deliberation: number; inscription: number }) =>
        documentsApi.decision(deliberation, inscription),
      onSuccess:  invalider,
    }),
    attestationCnim: useMutation({
      mutationFn: ({ deliberation, inscription }: { deliberation: number; inscription: number }) =>
        documentsApi.attestationCnim(deliberation, inscription),
      onSuccess:  invalider,
    }),
    decisionsClasse: useMutation({
      mutationFn: ({ deliberation, classe }: { deliberation: number; classe?: number }) =>
        documentsApi.decisionsClasse(deliberation, classe),
      onSuccess:  invalider,
    }),
  };
}
