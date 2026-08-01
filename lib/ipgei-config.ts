/**
 * Configuration du produit IPGEI.
 *
 * IPGEI est un fork du socle SIGA dont la couche académique LMD (filières,
 * modules/EM, évaluations et délibération LMD, stages, progressions) est
 * remplacée par le moteur `ipgei` (plan §3 et §4).
 *
 * Le code backend de ces apps reste en place — le socle en dépend par clés
 * étrangères (`documents`, `portail`, `reclamations`), et le plan précise
 * explicitement que « le socle n'est pas réécrit ». Ce qui est retiré, c'est
 * l'ACCÈS : les entrées de menu LMD disparaissent au profit des écrans IPGEI.
 *
 * Passer `AFFICHER_MENU_LMD` à `true` les fait réapparaître, sans migration ni
 * perte de données — utile pour un diagnostic ou une reprise de données.
 */
export const AFFICHER_MENU_LMD = false;

/**
 * Clés de `NAV_GROUPS` masquées, pour deux raisons distinctes :
 *
 *  1. couche académique LMD remplacée par le moteur IPGEI ;
 *  2. écrans du socle **doublonnés** par un équivalent IPGEI — c'est le cas de
 *     l'emploi du temps : les deux planifiaient dans des tables différentes,
 *     donc une séance saisie dans l'un n'apparaissait pas dans l'autre. Deux
 *     plannings concurrents pour une même classe est un défaut, pas une option.
 *
 * Restent visibles les briques du socle réutilisées telles quelles : étudiants,
 * enseignants, salles, groupes, comptes, suivi, vacations, avancement,
 * statistiques, sauvegardes, audit et paramètres.
 */
export const GROUPES_NAV_LMD = [
  // ── Doublonnés par un écran IPGEI ────────────────────────────────────────
  'emplois',                  // planification SIGA → /dashboard/ipgei/edt/*
  'departements',             // « Groupes » = miroir des classes → /dashboard/ipgei/classes
  // ── Couche académique LMD ────────────────────────────────────────────────
  'filieres',                 // filières LMD → remplacées par les classes MPSI/MP
  'departements-academiques', // départements académiques LMD
  'modules',                  // modules LMD → remplacés par les matières IPGEI
  'em',                       // éléments de module → sans objet en prépa
  'inscriptions',             // inscriptions pédagogiques LMD → inscriptions IPGEI
  'evaluations',              // notes CC/TP + PV de délibération LMD
  'progressions',             // progressions N+1 LMD
  'ponderation-calcul',       // pondération LMD → réglée par matière côté IPGEI
  'stages',                   // stages / PFE : hors cursus préparatoire
  'documents',                // documents LMD → documents IPGEI
] as const;

// NB — `avancement` N'EST PAS masqué : c'est le suivi de la charge des
// enseignants, pas de l'académique LMD. Il s'appuie sur Suivi et Emplois, donc
// sur les départements miroir des classes IPGEI, et fait partie intégrante de la
// partie pédagogique reprise de SIGA.
