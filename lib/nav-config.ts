import {
  BarChart2, Calendar, ClipboardList, TrendingUp, UserX,
  Banknote, Users, Building2, BookOpen,
  Landmark, UserCog, CalendarDays,
  ChevronRight, Bell, User, KeyRound, ChevronDown,
  GraduationCap, UserCheck, FileBadge, Globe, Scale,
  LayoutDashboard, AlertCircle, ClipboardCheck, Edit3,
  BookMarked, ArrowUpCircle, History, RefreshCw,
  Briefcase, Database, Repeat, BookOpenCheck,
  Gavel, EyeOff, Settings, PenLine,
} from 'lucide-react';
import type { UserRole, RbacAction } from '@/lib/auth';
import {
  ALL, MANAGE, ADMIN_ONLY, ADMIN_IT, SCOLARITE, EVALUATIONS,
  STAGES_ROLES, DOCS_ROLES, ETUDIANT_ONLY, ENSEIGNANT_ONLY,
} from '@/lib/auth-roles';
import { AFFICHER_MENU_LMD, GROUPES_NAV_LMD } from '@/lib/ipgei-config';

// ── Types ─────────────────────────────────────────────────────────────────────
export interface SubItem {
  href:    string;
  label:   string;
  /** Action RBAC requise pour voir cet item (défaut 'voir' si module défini sur le groupe). */
  action?: RbacAction;
  /** Module RBAC override pour ce sous-item. Si défini, prime sur group.module.
   *  Sert pour le découpage granulaire (ex: documents/diplome → 'doc_diplome'). */
  module?: string;
}
export interface NavGroup {
  key:          string;
  icon:         React.ElementType;
  label:        string;
  section?:     string;
  /** Filtre par rôle (legacy + portails étudiant/enseignant + admin-only sans module RBAC). */
  roles:        UserRole[];
  /** Module RBAC qui contrôle la visibilité de ce groupe (Phase 0+ RBAC).
   *  Si défini, canSee() utilise canAccess(module, 'voir') au lieu du filtre par rôle.
   *  Laissé `undefined` pour les groupes purement admin-only ou portails (filtrage par rôle). */
  module?:      string;
  items:        SubItem[];
}
export interface NavGroupResolved extends NavGroup { showSection: boolean; }

// Bouquet d'icônes ré-exporté (utilisé par d'autres composants du layout)
export {
  ChevronRight, Bell, User, KeyRound, ChevronDown,
};

// ── Configuration du menu ─────────────────────────────────────────────────────
//
// L'ordre et les regroupements suivent le TRAVAIL, pas l'origine du code. Le
// menu mêlait deux héritages — le module IPGEI et le socle SIGA —, si bien que
// la journée d'un même agent traversait deux sections : l'emploi du temps d'un
// côté, le suivi des séances et les absences de l'autre. Six sections désormais,
// dans l'ordre où l'on s'en sert :
//
//   Pilotage · Scolarité · Enseignement · Notes & jurys · Finances · Système
//
// Trois règles tiennent ce fichier :
//
//   1. UN SEUL LIEN ⇒ PAS DE GROUPE. `NavTree` rend d'office en lien direct tout
//      groupe qui ne compte qu'une entrée après filtrage RBAC — rien à déclarer
//      ici, il suffit de ne pas gonfler un groupe pour le principe.
//   2. SEPT ENTRÉES AU PLUS, sauf séquence qu'on parcourt dans l'ordre
//      (inscriptions, absences), où la liste EST le déroulé du travail.
//   3. LE RÉGLAGE RARE QUITTE LA BARRE. Les douze référentiels vivent sur
//      `/dashboard/parametres`, une page de cartes qui les explique — ce que le
//      menu ne permet pas.
//
// `TOUS_LES_GROUPES` décrit le menu complet du fork (IPGEI + socle + LMD).
// `NAV_GROUPS`, exporté plus bas, en retire la couche LMD remplacée par IPGEI.
const TOUS_LES_GROUPES: NavGroup[] = [
  // ═══ Pilotage ═════════════════════════════════════════════════════════════
  // Ce qu'on regarde, pas ce qu'on saisit. En tête parce qu'on y arrive en
  // ouvrant l'application, et qu'on n'y revient qu'entre deux tâches.
  {
    key: 'ipgei-accueil', icon: LayoutDashboard, label: 'Tableau de bord',
    section: 'Pilotage', roles: ALL, module: 'ipgei_classes',
    items: [
      { href: '/dashboard/ipgei', label: 'Tableau de bord' },
    ],
  },
  {
    key: 'statistiques', icon: BarChart2, label: 'Statistiques',
    section: 'Pilotage', roles: MANAGE, module: 'statistiques',
    items: [
      { href: '/dashboard/statistiques/profs',                label: 'Enseignants' },
      { href: '/dashboard/statistiques/semestres',            label: 'Avancement par semestre' },
      { href: '/dashboard/statistiques/vacations',            label: 'Vacations par mois' },
      { href: '/dashboard/statistiques/repartition-charges',  label: 'Répartition des charges' },
    ],
  },
  {
    key: 'avancement', icon: TrendingUp, label: 'Avancement',
    section: 'Pilotage', roles: MANAGE, module: 'avancement',
    items: [
      { href: '/dashboard/avancement/em',         label: 'Avancement par matière' },
      // Meme donnee, sans l'ecrasement par le maximum : c'est ici qu'on voit
      // quel groupe est en retard, et sur quelle seance.
      { href: '/dashboard/avancement/groupes',    label: 'Avancement par groupe' },
      // Ces trois ecrans regardent les ENSEIGNANTS et leurs heures — charge,
      // vacations —, non l'avancement d'une matiere. Ils relevent donc de
      // `statistiques`, que la direction detient et pas un chef de departement :
      // celui-ci suit ses matieres, il ne consulte pas la charge de l'institut.
      { href: '/dashboard/avancement/profs',      label: 'Avancement par enseignant', module: 'statistiques' },
      { href: '/dashboard/avancement/permanents', label: 'Charge des permanents',     module: 'statistiques' },
      { href: '/dashboard/avancement/details',    label: 'Détail des enseignements',  module: 'statistiques' },
    ],
  },

  // ═══ Scolarité ════════════════════════════════════════════════════════════
  // Le dossier de l'étudiant, de sa candidature à ses pièces officielles.
  {
    key: 'etudiants', icon: Users, label: 'Étudiants',
    section: 'Scolarité', roles: SCOLARITE, module: 'scolarite_etudiants',
    items: [
      { href: '/dashboard/scolarite/etudiants/chercher', label: 'Chercher un étudiant' },
      { href: '/dashboard/scolarite/etudiants',          label: 'Liste des étudiants' },
      // Dépôt groupé, chaque photo nommée par le matricule : le droit de
      // MODIFIER les étudiants, comme le serveur (apps/absence/photos.py).
      { href: '/dashboard/scolarite/etudiants/photos',   label: 'Photos des étudiants', action: 'modifier' },
      // Composer les demi-groupes d'une classe : le geste de la rentrée, et
      // celui d'après chaque répartition entre classes, qui les vide.
      { href: '/dashboard/scolarite/etudiants/groupes',  label: 'Affectation aux groupes',
        module: 'ipgei_inscriptions', action: 'modifier' },
      // Un étudiant d'IPGEI n'entre pas par ici : il arrive par l'inscription
      // IPGEI, qui lui donne son année, son niveau et sa classe d'un seul
      // geste. La saisie unitaire et l'import Excel du socle créaient un
      // dossier hors cursus — visible dans la liste, inscrit nulle part.
      { href: '/dashboard/scolarite/etudiants/comptes',  label: 'Comptes portail' },
    ],
  },
  // Huit entrées, et elles restent ensemble : c'est le parcours d'inscription
  // dans son ordre — le candidat se présente, on l'inscrit, on l'affecte à ses
  // matières, on traite les cas particuliers, on facture. Le scinder obligerait
  // à passer d'un groupe à l'autre au milieu d'un même dossier.
  {
    key: 'ipgei-inscriptions', icon: UserCheck, label: 'Inscriptions',
    section: 'Scolarité', roles: ALL, module: 'ipgei_inscriptions',
    items: [
      { href: '/dashboard/ipgei/inscriptions/preinscriptions', label: 'Pré-inscriptions',      module: 'ipgei_inscriptions' },
      { href: '/dashboard/ipgei/inscriptions/nouvelle',        label: 'Nouvelle inscription',  module: 'ipgei_inscriptions', action: 'modifier' },
      { href: '/dashboard/ipgei/inscriptions',                 label: 'Inscriptions admin.',   module: 'ipgei_inscriptions' },
      { href: '/dashboard/ipgei/inscriptions/affectation',     label: 'Affectation aux classes', module: 'ipgei_inscriptions', action: 'modifier' },
      { href: '/dashboard/ipgei/inscriptions/repartition',     label: 'Répartition entre classes', module: 'ipgei_inscriptions', action: 'modifier' },
      { href: '/dashboard/ipgei/inscriptions/pedagogiques',    label: 'Inscriptions pédag.',   module: 'ipgei_inscriptions' },
      { href: '/dashboard/ipgei/inscriptions/derogations',     label: 'Dérogations',           module: 'ipgei_inscriptions' },
      { href: '/dashboard/ipgei/inscriptions/frais',           label: 'Grille tarifaire',      module: 'ipgei_inscriptions' },
    ],
  },
  {
    key: 'ipgei-structure', icon: Users, label: 'Classes & sous-groupes',
    section: 'Scolarité', roles: ALL, module: 'ipgei_classes',
    items: [
      { href: '/dashboard/ipgei/classes', label: 'Classes & sous-groupes', module: 'ipgei_classes' },
    ],
  },
  // Les pièces officielles : l'émission se distingue de la consultation.
  {
    key: 'ipgei-documents', icon: FileBadge, label: 'Documents officiels',
    section: 'Scolarité', roles: ALL, module: 'ipgei_documents',
    items: [
      { href: '/dashboard/ipgei/documents/generer', label: 'Générer un document',
        module: 'ipgei_documents', action: 'modifier' },
      { href: '/dashboard/ipgei/documents/lot',     label: 'Générer par groupe',
        module: 'ipgei_documents', action: 'modifier' },
      // Le pendant du précédent : même fournée, mais désignée par matricules.
      // Une classe entière ne couvre pas la liste qui traverse les classes.
      { href: '/dashboard/ipgei/documents/matricules', label: 'Générer par matricules',
        module: 'ipgei_documents', action: 'modifier' },
      // Tous les relevés de semestre d'un ou de plusieurs élèves, toutes leurs
      // années, en un seul PDF (apps/documents/releves_etudiant.py).
      { href: '/dashboard/documents/releves-etudiant', label: "Relevés d'étudiants",
        module: 'ipgei_documents', action: 'modifier' },
      // Consultation : lecture seule, donc le droit de VOIR suffit — exiger
      // « modifier » interdirait de vérifier une moyenne à qui ne délivre pas.
      { href: '/dashboard/ipgei/documents/consultation', label: 'Consulter les notes',
        module: 'ipgei_documents' },
      { href: '/dashboard/ipgei/documents',         label: 'Registre des documents',
        module: 'ipgei_documents' },
    ],
  },
  {
    key: 'reclamations-admin', icon: AlertCircle, label: 'Réclamations',
    section: 'Scolarité', roles: SCOLARITE, module: 'reclamations',
    items: [{ href: '/dashboard/reclamations', label: 'Gestion réclamations' }],
  },
  // L'établissement lui-même : sa raison sociale, son en-tête, son cachet —
  // ce qui s'imprime en haut de chaque pièce délivrée. Il vivait sous un titre
  // « Scolarité LMD » hérité, seul de sa section.
  {
    key: 'institution', icon: Globe, label: 'Institution',
    section: 'Scolarité', roles: ADMIN_ONLY,
    items: [
      { href: '/dashboard/institution', label: 'Paramétrage établissement' },
    ],
  },

  // ═══ Enseignement ═════════════════════════════════════════════════════════
  // La semaine, dans son ordre réel : on pose l'emploi du temps, on l'ajuste,
  // on constate ce qui a été fait, on relève les absents. Suivi et absences
  // venaient du socle et vivaient sous un autre titre — c'était la frontière
  // des deux bases de code, pas celle du travail.
  {
    key: 'ipgei-edt', icon: CalendarDays, label: 'Emploi du temps',
    section: 'Enseignement', roles: ALL, module: 'ipgei_edt',
    items: [
      // « Semaine (saisie) » a fusionné dans « Gérer les emplois », qui porte
      // désormais un sélecteur de période : même grille pour le patron et pour
      // une semaine donnée. La route reste servie le temps de valider la
      // fusion, mais n'est plus proposée au menu.
      { href: '/dashboard/ipgei/edt/grille',     label: 'Gérer les emplois',     module: 'ipgei_edt', action: 'modifier' },
      { href: '/dashboard/ipgei/edt/classe',     label: 'Emploi par classe',     module: 'ipgei_edt' },
      { href: '/dashboard/ipgei/edt/enseignant', label: 'Emploi par enseignant', module: 'ipgei_edt' },
      { href: '/dashboard/ipgei/edt/salle',      label: 'Occupation des salles', module: 'ipgei_edt' },
      { href: '/dashboard/ipgei/edt/historique', label: 'Historique',            module: 'ipgei_edt' },
    ],
  },
  {
    key: 'ipgei-vie-scolaire', icon: Repeat, label: 'Permutations',
    section: 'Enseignement', roles: ALL, module: 'ipgei_permutations',
    items: [
      { href: '/dashboard/ipgei/permutations', label: 'Permutations', module: 'ipgei_permutations' },
    ],
  },
  {
    key: 'suivi', icon: ClipboardList, label: 'Suivi des séances',
    section: 'Enseignement', roles: ALL, module: 'suivi_fiches',
    items: [
      { href: '/dashboard/suivi/ajouter',              label: 'Ajouter un suivi',      module: 'suivi_saisie',  action: 'modifier' },
      { href: '/dashboard/suivi/fiches-individuelles', label: 'Fiches individuelles',  module: 'suivi_fiches',  action: 'voir' },
      { href: '/dashboard/suivi/fiches-collectives',   label: 'Fiches collectives',    module: 'suivi_fiches',  action: 'voir' },
      { href: '/dashboard/suivi/remplissage',          label: 'Remplissage',           module: 'suivi_saisie',  action: 'modifier' },
      { href: '/dashboard/suivi/rattrapage',           label: 'Rattrapage',            module: 'suivi_saisie',  action: 'voir' },
      { href: '/dashboard/suivi/charges',              label: 'Charges GP',            module: 'suivi_charges', action: 'voir' },
      // L'attestation se tire de ce qui a été fait en séance : elle suit le
      // suivi, et non la liste des vacations où elle était rangée. Son module
      // reste `vac_paiement` — c'est le droit de payer qui l'ouvre, pas celui
      // de remplir une fiche, et le déplacer ne doit rien changer à cela.
      { href: '/dashboard/payement/attestation',       label: 'Attestation',           module: 'vac_paiement',  action: 'modifier' },
    ],
  },
  {
    key: 'absences', icon: UserX, label: 'Absences',
    section: 'Enseignement', roles: ALL,
    items: [
      { href: '/dashboard/absences/saisir',          label: 'Marquer les absences',    module: 'abs_saisie',        action: 'modifier' },
      { href: '/dashboard/absences/saisir/salle',    label: 'Mode Salle (mobile)',     module: 'abs_saisie',        action: 'modifier' },
      { href: '/dashboard/absences/etudiant',        label: 'ABS par étudiant(e)',     module: 'abs_rapport',       action: 'voir' },
      { href: '/dashboard/absences/rapport',         label: 'Rapport absences',        module: 'abs_rapport',       action: 'voir' },
      { href: '/dashboard/absences/stats',           label: 'Statistiques ABS',        module: 'abs_rapport',       action: 'voir' },
      { href: '/dashboard/absences/fiches',          label: 'Fiches de présence',      module: 'abs_rapport',       action: 'voir' },
      { href: '/dashboard/absences/justificatifs',   label: 'Justificatifs (DA)',      module: 'abs_justificatifs', action: 'modifier' },
      // L'import ferme la liste : on ne le fait qu'à la rentrée, et le placer en
      // tête donnait à un geste annuel la première place d'un menu quotidien.
      { href: '/dashboard/absences/importer',        label: 'Importer les étudiants',  module: 'abs_import',        action: 'modifier' },
    ],
  },
  {
    key: 'profs', icon: Users, label: 'Enseignants',
    section: 'Enseignement', roles: MANAGE, module: 'profs',
    items: [
      { href: '/dashboard/profs',                    label: 'Liste des enseignants' },
      { href: '/dashboard/profs/ajouter',            label: 'Ajouter un enseignant', action: 'modifier' },
      { href: '/dashboard/profs/historique-statut',  label: 'Historique de statut' },
    ],
  },
  {
    key: 'ipgei-academique', icon: BookOpen, label: 'Matières & pondération',
    section: 'Enseignement', roles: ALL, module: 'ipgei_matieres',
    items: [
      { href: '/dashboard/ipgei/matieres', label: 'Matières & pondération', module: 'ipgei_matieres' },
      // L'exception, à part de la règle : une matière comptée autrement
      // pour une seule classe. Rare, mais introuvable si on la cache.
      { href: '/dashboard/ipgei/matieres/ponderations', label: 'Pondérations dérogatoires',
        module: 'ipgei_matieres', action: 'modifier' },
    ],
  },

  // ═══ Notes & jurys ════════════════════════════════════════════════════════
  // Un seul groupe « Évaluations » portait douze entrées et trois métiers : la
  // saisie courante, la chaîne d'anonymat, et les jurys qui prononcent des
  // décisions. Trois moments de l'année, trois responsables, souvent trois
  // droits — le président de jury n'a rien à faire dans l'import Excel.
  //
  // Aucun des trois groupes ne porte de `module` : chaque entrée est filtrée
  // par le sien, et le groupe disparaît de lui-même quand il ne reste rien à
  // montrer. Un module de groupe fermerait la porte à qui n'a que le droit
  // voisin — c'est ce qui privait le président de jury de sa propre entrée.
  {
    key: 'ipgei-notes-saisie', icon: PenLine, label: 'Saisie des notes',
    section: 'Notes & jurys', roles: ALL,
    items: [
      { href: '/dashboard/ipgei/notes',          label: 'Saisie des notes',    module: 'ipgei_notes', action: 'modifier' },
      // Ouvrir ou clore une campagne engage tout l'etablissement : c'est un
      // acte de scolarite, sous son propre module — un chef de departement
      // lit les notes de sa discipline, il ne decide pas des campagnes.
      { href: '/dashboard/ipgei/notes/sessions', label: 'Sessions de saisie',  module: 'ipgei_sessions' },
      // Le CALENDRIER des epreuves — la composition elle-meme : sa date, son
      // heure, sa duree, les classes convoquees. Voisin des sessions, dont il
      // depend, et non de l'emploi du temps : une epreuve n'est pas une seance,
      // sa duree ne tombe pas sur la grille de 1h30 et elle n'a ni salle ni
      // enseignant. Meme module que les sessions, pour la meme raison — decider
      // quand l'etablissement compose est un acte de scolarite.
      { href: '/dashboard/ipgei/epreuves',       label: 'Calendrier des épreuves',
        module: 'ipgei_sessions' },
      { href: '/dashboard/ipgei/notes/collecte', label: 'Fiches de collecte',  module: 'ipgei_notes' },
      // La fiche d'emargement accompagne la collecte le jour de l'epreuve :
      // memes candidats, meme ordre. Elle vit donc a cote d'elle.
      { href: '/dashboard/ipgei/notes/fiche-emargement', label: "Fiches d'émargement", module: 'ipgei_notes' },
      // L'import ÉCRIT des notes : il exige « modifier », là où éditer une
      // fiche vierge se contente de « voir ».
      { href: '/dashboard/ipgei/notes/import',   label: 'Import Excel des notes',
        module: 'ipgei_notes', action: 'modifier' },
      // L'émargement précède tout le reste : c'est le pointage du jour de
      // l'épreuve, et c'est de lui que vient le « ABS » porté sur les fiches
      // de collecte. Il vit ici et non sous l'emploi du temps : ce qu'on y
      // saisit sert à la correction, pas au calendrier.
      //
      // Le module gardé est `ipgei_edt` et non `ipgei_notes` : la feuille
      // d'appel est servie par l'endpoint des séances, qui exige ce module.
      // Annoncer l'entrée à qui ne l'a pas mènerait à un 403 sur un écran
      // ouvert depuis le menu.
      { href: '/dashboard/ipgei/notes/emargement', label: 'Émargement des épreuves',
        module: 'ipgei_edt', action: 'modifier' },
    ],
  },
  // Une chaîne en trois temps, qu'on suit dans cet ordre : tirer les numéros,
  // saisir sous couvert, lever l'anonymat pour le secrétariat.
  {
    key: 'ipgei-anonymat', icon: EyeOff, label: 'Anonymat des copies',
    section: 'Notes & jurys', roles: ALL,
    items: [
      { href: '/dashboard/ipgei/notes/anonymat',        label: 'Tirage de l\'anonymat', module: 'ipgei_notes', action: 'modifier' },
      { href: '/dashboard/ipgei/notes/saisie-anonymat', label: 'Saisie sous anonymat',  module: 'ipgei_notes', action: 'modifier' },
      // La table numéro ↔ matricule lève l'anonymat : elle exige « modifier »,
      // comme le tirage, et non le simple droit de voir les notes.
      { href: '/dashboard/ipgei/notes/secretariat',     label: 'Export secrétariat',
        module: 'ipgei_notes', action: 'modifier' },
    ],
  },
  {
    key: 'ipgei-jurys', icon: Gavel, label: 'Jurys & décisions',
    section: 'Notes & jurys', roles: ALL,
    items: [
      { href: '/dashboard/ipgei/deliberations',  label: 'Délibérations',       module: 'ipgei_deliberation' },
      // Feuille de travail de l'affectation, éditée hors de tout jury : elle ne
      // porte aucun numéro de registre et se réimprime dès qu'une note bouge.
      { href: '/dashboard/ipgei/notes/classement', label: 'Classement S3',
        module: 'ipgei_deliberation' },
      // Le concours clôt le cursus : son résultat vient de l'extérieur, et
      // c'est lui qui décide entre sortant, redoublant et réorienté.
      { href: '/dashboard/ipgei/notes/cnim', label: 'Résultat du concours (CNIM)',
        module: 'ipgei_deliberation', action: 'modifier' },
      // Une sanction change ce qu'un jury a arrêté : même module que les jurys,
      // et le droit de « voir » suffit à consulter les fiches.
      { href: '/dashboard/ipgei/fraudes', label: 'Fraudes', module: 'ipgei_deliberation' },
    ],
  },

  // ═══ Finances ═════════════════════════════════════════════════════════════
  // Le vacataire est payé sur un compte : les deux écrans se suivent, alors
  // qu'ils vivaient dans deux sections différentes.
  {
    key: 'vacations', icon: Banknote, label: 'Vacations',
    section: 'Finances', roles: MANAGE, module: 'vac_saisie',
    items: [
      { href: '/dashboard/payement/ajouter',     label: 'Ajouter vacation',          module: 'vac_saisie',     action: 'modifier' },
      { href: '/dashboard/payement/liste',       label: 'Liste des vacations',       module: 'vac_saisie',     action: 'voir' },
      { href: '/dashboard/payement/fiches',      label: 'Fiches vacataires',         module: 'vac_saisie',     action: 'voir' },
      { href: '/dashboard/payement/etat',        label: 'État de vacation',          module: 'vac_validation', action: 'voir' },
      { href: '/dashboard/payement/details',     label: 'Détails de vacation',       module: 'vac_validation', action: 'voir' },
      { href: '/dashboard/payement/heures-supp', label: 'Heures supp. permanents',   module: 'vac_validation', action: 'voir' },
    ],
  },
  {
    key: 'banques', icon: Landmark, label: 'Banques',
    section: 'Finances', roles: MANAGE, module: 'banques',
    items: [
      { href: '/dashboard/banque',         label: 'Liste des banques' },
      { href: '/dashboard/banque/ajouter', label: 'Ajouter une banque', action: 'modifier' },
    ],
  },

  // ═══ Système ══════════════════════════════════════════════════════════════
  // Trois façons d'ouvrir un droit à quelqu'un — un compte, une délégation
  // d'emploi du temps, une autorisation de rattrapage — se cherchaient dans
  // trois sections. Elles sont ici, ensemble.
  {
    key: 'comptes', icon: UserCog, label: 'Comptes & droits',
    section: 'Système', roles: ADMIN_ONLY,
    items: [
      { href: '/dashboard/comptes',                      label: 'Liste des utilisateurs' },
      { href: '/dashboard/comptes/ajouter',              label: 'Ajouter un utilisateur' },
      { href: '/dashboard/comptes/permissions',          label: 'Permissions' },
      { href: '/dashboard/comptes/defaults',             label: 'Défauts par rôle' },
      { href: '/dashboard/deblocage',                    label: 'Débloquer un utilisateur' },
      { href: '/dashboard/parametres/permissions-edt',   label: 'Permissions EDT' },
      { href: '/dashboard/parametres/permissions-suivi', label: 'Rattrapage suivi' },
    ],
  },
  // Publier est un GESTE, pas une rubrique : on le déclenche, on regarde le
  // journal, on repart. Il sort donc du groupe pour devenir une entrée de
  // premier rang — au même titre que le journal d'audit. Réservé à
  // l'administrateur : c'est lui qui décide d'écraser le miroir.
  {
    key: 'synchronisation', icon: RefreshCw, label: 'Publier vers le portail',
    section: 'Système', roles: ADMIN_ONLY,
    items: [
      { href: '/dashboard/synchronisation', label: 'Publier vers le portail' },
    ],
  },
  // Restent les deux BOÎTES DE RÉCEPTION : le VPS est un miroir en lecture
  // seule, sauf pour ce que les enseignants y déposent — une réclamation de
  // séance, une saisie de notes. Ces dépôts n'ont pas d'équivalent local, et
  // c'est ici que la direction les tranche.
  {
    key: 'portail-inbox', icon: Globe, label: 'Portail en ligne',
    section: 'Système', roles: ADMIN_IT,
    items: [
      { href: '/dashboard/suivi/reclamations-seance',   label: 'Réclamations séances' },
      { href: '/dashboard/evaluations/saisie-en-ligne', label: 'Saisie de notes en ligne' },
    ],
  },
  {
    key: 'historique', icon: History, label: 'Journal d\'audit',
    section: 'Système', roles: ADMIN_IT,
    items: [
      { href: '/dashboard/historique', label: 'Tous les évènements' },
    ],
  },
  {
    key: 'backups', icon: Database, label: 'Sauvegardes',
    section: 'Système', roles: ADMIN_ONLY,  // les non-admin avec grant accèdent via URL directe
    items: [
      { href: '/dashboard/parametres/backups',             label: 'Liste & téléchargement' },
      { href: '/dashboard/parametres/permissions-backup',  label: 'Utilisateurs autorisés' },
    ],
  },
  // Douze référentiels tenaient douze groupes, dont huit à une seule page —
  // plus du tiers du menu permanent pour des réglages qu'on touche trois fois
  // l'an. Ils vivent désormais sur une page de cartes, qui a la place de dire à
  // quoi chacun sert.
  {
    key: 'parametrage', icon: Settings, label: 'Paramétrage',
    section: 'Système', roles: MANAGE,
    items: [
      { href: '/dashboard/parametres', label: 'Paramétrage' },
      // Une entrée À PART, et non une carte seulement : cachée dans la page
      // Semaines, la gestion des jours fériés restait introuvable. On la
      // cherche au moment où un jour tombe, pas en parcourant le paramétrage.
      { href: '/dashboard/parametres/jours-feries', label: 'Jours fériés' },
    ],
  },

  // ═══ Portail Étudiant ═════════════════════════════════════════════════════
  {
    key: 'portail-accueil', icon: LayoutDashboard, label: 'Tableau de bord',
    section: 'Portail Étudiant', roles: ETUDIANT_ONLY,
    items: [{ href: '/dashboard/portail', label: 'Accueil' }],
  },
  {
    key: 'portail-profil', icon: User, label: 'Mon profil',
    roles: ETUDIANT_ONLY,
    items: [{ href: '/dashboard/portail/profil', label: 'Mon profil' }],
  },
  {
    key: 'portail-emploi', icon: Calendar, label: 'Emploi du temps',
    roles: ETUDIANT_ONLY,
    items: [{ href: '/dashboard/portail/emploi', label: 'Emploi du temps' }],
  },
  {
    key: 'portail-absences', icon: UserX, label: 'Mes absences',
    roles: ETUDIANT_ONLY,
    items: [{ href: '/dashboard/portail/absences', label: 'Mes absences' }],
  },
  {
    key: 'portail-notes', icon: ClipboardList, label: 'Mes notes',
    roles: ETUDIANT_ONLY,
    items: [{ href: '/dashboard/portail/notes', label: 'Mes notes' }],
  },
  // Le fil pédagogique vit EN LIGNE : il n'existe que sur le portail, où
  // l'enseignant publie et où l'étudiant répond. Rien de tout cela ne redescend
  // sur le serveur local, qui ne le connaît pas.
  {
    key: 'portail-cours', icon: BookOpenCheck, label: 'Cours',
    roles: ETUDIANT_ONLY,
    items: [{ href: '/dashboard/portail/cours', label: 'Cours & échanges' }],
  },
  {
    key: 'portail-documents', icon: FileBadge, label: 'Documents',
    roles: ETUDIANT_ONLY,
    items: [{ href: '/dashboard/portail/documents', label: 'Mes documents' }],
  },
  {
    key: 'portail-reclamations', icon: AlertCircle, label: 'Réclamations',
    roles: ETUDIANT_ONLY,
    items: [{ href: '/dashboard/portail/reclamations', label: 'Mes réclamations' }],
  },
  {
    key: 'portail-releve', icon: BookMarked, label: 'Mon relevé',
    roles: ETUDIANT_ONLY,
    items: [{ href: '/dashboard/portail/releve', label: 'Relevé de notes annuel' }],
  },
  {
    key: 'portail-progression', icon: ArrowUpCircle, label: 'Ma progression',
    roles: ETUDIANT_ONLY,
    items: [{ href: '/dashboard/portail/progression', label: 'Décision de passage' }],
  },

  // ═══ Portail Enseignant ═══════════════════════════════════════════════════
  {
    key: 'ens-accueil', icon: LayoutDashboard, label: 'Tableau de bord',
    section: 'Portail Enseignant', roles: ENSEIGNANT_ONLY,
    items: [{ href: '/dashboard/enseignant', label: 'Accueil' }],
  },
  // Espace personnel de l'enseignant, dans SON portail et nulle part ailleurs.
  //
  // `roles` ne contient plus 'admin' : l'entrée s'affichait aussi dans le menu
  // du personnel, où elle n'a pas de sens — un administrateur n'a pas de
  // feuilles à lui. Elle est réservée au rôle enseignant, comme le reste de
  // cette section.
  //
  // Sans `module` : les enseignants n'ont pas `ipgei_notes` — c'est justement
  // la raison d'être de cet écran, qui ne montre que le périmètre de celui qui
  // le consulte.
  {
    key: 'ipgei-mon-enseignement', icon: BookOpenCheck, label: 'Mes feuilles de notes',
    roles: ENSEIGNANT_ONLY,
    items: [
      { href: '/dashboard/ipgei/notes/mes-feuilles',
        label: 'Mes feuilles de notes (officiel)' },
    ],
  },
  {
    key: 'ens-profil', icon: User, label: 'Mon profil',
    roles: ENSEIGNANT_ONLY,
    items: [{ href: '/dashboard/enseignant/profil', label: 'Mon profil' }],
  },
  {
    key: 'ens-emploi', icon: Calendar, label: 'Emploi du temps',
    roles: ENSEIGNANT_ONLY,
    items: [{ href: '/dashboard/enseignant/emploi', label: 'Emploi du temps' }],
  },
  {
    key: 'ens-suivi', icon: ClipboardCheck, label: 'Suivi des séances',
    roles: ENSEIGNANT_ONLY,
    items: [{ href: '/dashboard/enseignant/suivi', label: 'Suivi des séances' }],
  },
  {
    key: 'ens-avancement', icon: TrendingUp, label: 'Avancement',
    roles: ENSEIGNANT_ONLY,
    items: [
      { href: '/dashboard/enseignant/avancement',           label: 'Avancement par matière' },
      { href: '/dashboard/enseignant/detail-enseignements', label: 'Détail séances' },
    ],
  },
  // DEUX entrées de notes, et ce n'est pas un doublon :
  //   « Mes feuilles » ouvre la grille OFFICIELLE, sur le serveur local ;
  //   celle-ci dépose des BROUILLONS, et c'est la seule qui marche en ligne,
  //   le miroir refusant toute écriture hors boîte de réception.
  // Les libellés doivent le dire, sinon l'enseignant en ligne s'obstine sur
  // l'écran qui ne peut pas enregistrer.
  {
    key: 'ens-notes', icon: Edit3, label: 'Saisie en ligne',
    roles: ENSEIGNANT_ONLY,
    items: [{ href: '/dashboard/enseignant/notes',
              label: 'Saisie en ligne (brouillon)' }],
  },
  // Publier un cours et répondre aux étudiants : le pendant enseignant du fil
  // que les étudiants lisent depuis leur portail.
  {
    key: 'ens-cours', icon: BookOpenCheck, label: 'Cours',
    roles: ENSEIGNANT_ONLY,
    items: [{ href: '/dashboard/enseignant/cours', label: 'Cours & échanges' }],
  },
  {
    key: 'ens-reclamations', icon: AlertCircle, label: 'Réclamations',
    roles: ENSEIGNANT_ONLY,
    items: [{ href: '/dashboard/enseignant/reclamations', label: 'Réclamations' }],
  },
  {
    key: 'ens-vacations', icon: Banknote, label: 'Vacations',
    roles: ENSEIGNANT_ONLY,
    items: [{ href: '/dashboard/enseignant/vacations', label: 'Vacations' }],
  },

  // ═══ Couche LMD — masquée par le fork ═════════════════════════════════════
  // Conservée telle quelle : `GROUPES_NAV_LMD` la retire du menu effectif, et
  // `AFFICHER_MENU_LMD` la rétablit sans autre changement. Ces groupes ne sont
  // pas réorganisés — ils ne s'affichent pas.
  {
    key: 'emplois', icon: Calendar, label: 'Emplois du temps',
    roles: ALL, module: 'emplois',
    items: [
      { href: '/dashboard/emplois/gerer',    label: 'Gérer emplois',  action: 'modifier' },
      { href: '/dashboard/emplois/importer', label: 'Importer EDT (depuis suivi)', action: 'modifier' },
      { href: '/dashboard/emplois/filiere',  label: 'Emplois filière' },
      { href: '/dashboard/emplois/salle',    label: 'Emplois salle' },
      { href: '/dashboard/emplois/prof',     label: 'Emplois professeur' },
    ],
  },
  {
    key: 'departements', icon: Building2, label: 'Groupes',
    roles: MANAGE, module: 'departements',
    items: [
      { href: '/dashboard/departements',          label: 'Liste des groupes' },
      { href: '/dashboard/departements/ajouter',  label: 'Ajouter groupe', action: 'modifier' },
      { href: '/dashboard/departements/affecter', label: 'Affecter étudiants', action: 'modifier' },
    ],
  },
  {
    key: 'em', icon: BookOpen, label: 'Matières',
    roles: MANAGE, module: 'em',
    items: [
      { href: '/dashboard/em',         label: 'Liste des matières' },
      { href: '/dashboard/em/ajouter', label: 'Ajouter une matière', action: 'modifier' },
    ],
  },
  {
    key: 'filieres', icon: GraduationCap, label: 'Filières',
    roles: SCOLARITE, module: 'scolarite_filieres',
    items: [
      { href: '/dashboard/scolarite/filieres',         label: 'Liste des filières' },
      { href: '/dashboard/scolarite/filieres/ajouter', label: 'Ajouter filière', action: 'modifier' },
    ],
  },
  {
    key: 'departements-academiques', icon: Landmark, label: 'Départements',
    roles: SCOLARITE, module: 'scolarite',
    items: [
      { href: '/dashboard/scolarite/departements', label: 'Liste des départements' },
    ],
  },
  {
    key: 'modules', icon: BookOpen, label: 'Modules',
    roles: SCOLARITE, module: 'scolarite',
    items: [
      { href: '/dashboard/scolarite/modules',         label: 'Liste des modules' },
      { href: '/dashboard/scolarite/modules/ajouter', label: 'Ajouter module', action: 'modifier' },
    ],
  },
  {
    key: 'inscriptions', icon: UserCheck, label: 'Inscriptions',
    roles: SCOLARITE, module: 'insc_administrative',
    items: [
      { href: '/dashboard/inscriptions/nouvelle',         label: 'Nouvelle inscription', module: 'insc_administrative', action: 'modifier' },
      { href: '/dashboard/inscriptions/preinscriptions',  label: 'Pré-inscriptions',     module: 'insc_administrative', action: 'voir' },
      { href: '/dashboard/inscriptions/administratives',  label: 'Inscriptions admin.',  module: 'insc_administrative', action: 'voir' },
      { href: '/dashboard/inscriptions/pedagogiques',     label: 'Inscriptions pédag.',  module: 'insc_pedagogique',    action: 'voir' },
      { href: '/dashboard/inscriptions/derogations',      label: 'Dérogations',          module: 'insc_derogation',     action: 'voir' },
      { href: '/dashboard/inscriptions/grilles-frais',    label: 'Grille tarifaire',     module: 'insc_grille_frais',   action: 'voir' },
    ],
  },
  {
    key: 'evaluations', icon: ClipboardList, label: 'Évaluations',
    roles: EVALUATIONS, module: 'eval_saisie',
    items: [
      { href: '/dashboard/evaluations/sessions',              label: 'Sessions',              module: 'eval_saisie',     action: 'voir' },
      { href: '/dashboard/evaluations/notes',                 label: 'Consultation des notes',module: 'eval_saisie',     action: 'voir' },
      { href: '/dashboard/evaluations/notes/saisie',          label: 'Saisie des notes',      module: 'eval_saisie',     action: 'modifier' },
      { href: '/dashboard/evaluations/notes/saisie-anonymat', label: 'Saisie par anonymat',   module: 'eval_anonymat',   action: 'modifier' },
      { href: '/dashboard/evaluations/deliberations',         label: 'Délibérations',         module: 'delib_pv',        action: 'voir' },
      { href: '/dashboard/evaluations/rachats',               label: 'Rachats jury',          module: 'delib_rachat',    action: 'modifier' },
      { href: '/dashboard/evaluations/emargement',            label: 'Émargement',            module: 'eval_emargement', action: 'voir' },
      { href: '/dashboard/evaluations/collecte-notes',        label: 'Collecte de notes',     module: 'eval_collecte',   action: 'modifier' },
      { href: '/dashboard/evaluations/anonymat',              label: 'Anonymat',              module: 'eval_anonymat',   action: 'voir' },
    ],
  },
  {
    key: 'progressions', icon: ArrowUpCircle, label: 'Progressions N+1',
    roles: SCOLARITE, module: 'insc_progression',
    items: [
      { href: '/dashboard/scolarite/progressions', label: 'Gérer les progressions', module: 'insc_progression', action: 'modifier' },
    ],
  },
  {
    key: 'ponderation-calcul', icon: Scale, label: 'Pondération de calcul',
    roles: SCOLARITE, module: 'eval_saisie',
    items: [
      { href: '/dashboard/evaluations/ponderation', label: 'Paramètres de pondération', module: 'eval_saisie', action: 'modifier' },
    ],
  },
  {
    key: 'stages', icon: Briefcase, label: 'Stages / PFE',
    roles: STAGES_ROLES, module: 'stage_convention',
    items: [
      { href: '/dashboard/stages/conventions',  label: 'Conventions de stage',     module: 'stage_convention',  action: 'voir' },
      { href: '/dashboard/stages/evaluations',  label: 'Évaluations stage',        module: 'stage_evaluation',  action: 'voir' },
      { href: '/dashboard/stages/derogations',  label: 'Dérogations médicales',    module: 'stage_derogation',  action: 'voir' },
      { href: '/dashboard/stages/classement',   label: 'Classement (attribution)', module: 'stage_classement',  action: 'voir' },
    ],
  },
  {
    key: 'documents', icon: FileBadge, label: 'Documents officiels',
    roles: DOCS_ROLES, module: 'doc_registre',
    items: [
      { href: '/dashboard/documents/generer',            label: 'Générer document',    module: 'doc_attestation', action: 'modifier' },
      { href: '/dashboard/documents/consultation-notes', label: 'Consulter les notes', module: 'doc_releve',       action: 'voir' },
      { href: '/dashboard/documents/registre',           label: 'Registre diplômes',   module: 'doc_registre',     action: 'voir' },
    ],
  },
];

/**
 * Menu effectivement affiche.
 *
 * La couche académique LMD est retirée (plan §3) : ses écrans sont remplacés
 * par le module IPGEI. Le code backend reste en place — c'est l'accès qui
 * disparaît, pas les données. Rebasculer `AFFICHER_MENU_LMD` à `true` dans
 * `lib/ipgei-config.ts` les fait réapparaître sans autre changement.
 */
export const NAV_GROUPS: NavGroup[] = AFFICHER_MENU_LMD
  ? TOUS_LES_GROUPES
  : TOUS_LES_GROUPES.filter(
      g => !(GROUPES_NAV_LMD as readonly string[]).includes(g.key),
    );
