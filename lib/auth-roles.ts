import type { UserRole } from '@/lib/auth';

// ── Constantes de rôles RBAC pour le menu nav ────────────────────────────────
// `chef_departement` figure dans ALL, non parce qu'il voit tout, mais parce que
// les groupes de menu qui portent un `module` sont ensuite filtres par le RBAC :
// il ne verra que les entrees ouvertes a ses droits (matieres, notes, classes,
// deliberation, charges). L'omettre l'aurait prive de son propre menu.
export const ALL: UserRole[]            = ['admin','DG','DA','DE','AA','IT','scolarite','responsable_filiere','jury_president','chef_departement'];
export const MANAGE: UserRole[]         = ['admin','DG','DA','DE'];
export const ADMIN_ONLY: UserRole[]     = ['admin'];
export const ADMIN_IT: UserRole[]       = ['admin','IT'];
export const SCOLARITE: UserRole[]      = ['admin','DE','scolarite','responsable_filiere'];
export const EVALUATIONS: UserRole[]    = ['admin','DE','scolarite','jury_president','responsable_filiere'];
export const STAGES_ROLES: UserRole[]   = ['admin','DE','scolarite','responsable_filiere'];
export const DOCS_ROLES: UserRole[]     = ['admin','scolarite','DE'];
export const ETUDIANT_ONLY: UserRole[]   = ['etudiant'];
export const ENSEIGNANT_ONLY: UserRole[] = ['enseignant'];

// DEV_USER déplacé vers `lib/dev-mode.ts` (Maint-12 : tree-shake en prod).
