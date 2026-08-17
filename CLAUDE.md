# IPGEI — Frontend

> ## ⛔ DEUX INTERDITS ABSOLUS
>
> 1. **NE JAMAIS TOUCHER À `C:\SIR\SIGA`** (`siga` et `gesafped_frontend`).
>    Lecture seule, pour s'en inspirer. Aucune écriture, aucun commit, aucun push.
>    Vérifier avec `git -C C:\SIR\SIGA\siga status --porcelain` avant de conclure.
> 2. **N'ÉCRIRE QUE DANS LA BASE `IPGEI`.** Jamais `siga_pg`, jamais `gesafped26`,
>    jamais `siga_prive`. Elles cohabitent sur le même serveur PostgreSQL local.

Application Next.js 16 (App Router, React 19, TypeScript strict) qui consomme
l'API Django/DRF du backend **`C:\SIR\IPGEI\backend_ipgei`** (port 8000).
Authentification par cookies httpOnly + refresh JWT.

*Chiffres relevés le 17/08/2026 ; les recompter avant de s'y fier.*

## Stack

- **Framework** : Next.js 16.3.1 (Turbopack), App Router · React 19.2
- **Data fetching** : TanStack Query v5 — partout, plus d'`apiFetch` direct
- **Auth** : cookies httpOnly, refresh JWT toutes les 55 min, déconnexion sur
  inactivité à 20 min
- **Backend** : Django 4.2 + DRF, **PostgreSQL, base `IPGEI`**
- **Lint/types** : `npx tsc --noEmit` est la source de vérité (pas d'eslint strict)

## Règles non négociables

### 1. TanStack Query partout — pas d'`apiFetch` direct dans une page
Les 217 pages du dashboard sont migrées. Toute nouvelle page utilise :
```tsx
const { data, isLoading } = useQuery({
  queryKey: ['domaine', 'sous-clé', filters] as const,
  queryFn:  () => apiFetch(...),
  enabled:  !!requiredVar,
});
```
Listes paginées avec filtres : `placeholderData: keepPreviousData`.
Écritures : `useMutation` + `invalidateQueries` dans `onSuccess`.

**Attention à la forme de la réponse.** Un `ViewSet` DRF rend l'enveloppe
paginée `{count, pages, next, previous, results}`, pas un tableau. La lire comme
une liste donne un `.length` à `undefined` — l'état vide ne se déclenche même
pas — puis un `.map` qui échoue. Une `APIView`, elle, rend souvent une liste
nue : vérifier la vue avant d'écrire l'écran.

### 2. Fabrique de `queryKey` pour les domaines réutilisés
Dès qu'un domaine sert à plus de deux pages, créer `lib/api/<domaine>-hooks.ts`
(28 existent déjà) avec :
```ts
export const xxxKeys = {
  all:    ['xxx'] as const,
  lists:  () => [...xxxKeys.all, 'list'] as const,
  list:   (filters) => [...xxxKeys.lists(), filters] as const,
  detail: (id) => [...xxxKeys.all, 'detail', id] as const,
};
```
Squelette canonique : `lib/api/_template-hooks.ts`.
Le plus gros domaine est `lib/api/ipgei-hooks.ts` — inscriptions, notes,
délibérations, emploi du temps, documents.

### 3. Multi-institution et année : toujours filtrer
Filtrer par `annee_universitaire` **ou** `institution` dès que le domaine le
supporte (emplois, suivi, vacations, documents, notes). Sans cela, chevauchement
multi-institution silencieux — aucune erreur, des données mélangées.

### 4. Logout = purge des DEUX caches
`lib/auth.ts:logout()` et `lib/api.ts:_forceLogout()` purgent tous deux
`getQueryClient().clear()` **et** `lib/cache.ts`. Tout nouveau chemin de
déconnexion doit faire pareil — sinon l'utilisateur suivant voit les données du
précédent.

### 5. Le menu se règle dans les données, pas dans le composant
`lib/nav-config.ts` porte six sections — Pilotage, Scolarité, Enseignement,
Notes & jurys, Finances, Système —, 25 groupes et 85 liens pour un
administrateur. Deux mécanismes à connaître :

- **Un groupe qui ne compte qu'une entrée après filtrage RBAC se rend en lien
  direct**, sans chevron. `NavTree` le décide seul : rien à déclarer.
- `lib/ipgei-config.ts` porte `AFFICHER_MENU_LMD` (à `false`) et
  `GROUPES_NAV_LMD`, qui **retirent douze groupes** de la couche LMD remplacée
  par IPGEI. Les écrans existent toujours ; c'est l'accès qui disparaît.

Les référentiels rares ne vivent pas dans la barre mais sur
`/dashboard/parametres`, page de cartes.

## Structure

```
app/dashboard/          → 217 routes (page.tsx)
app/error.tsx           → boundary global, branché sur lib/monitor.ts
components/layout/      → Sidebar, Topbar, UserMenu, NavTree, InactivityModal
components/ui/          → primitives (Toast, ConfirmModal, FormField, Modal…)
components/Pagination.tsx → pied de pagination (page/pages/count/onPage)
components/charts/      → wrappers next/dynamic (évite chart.js dans le chunk initial)
hooks/                  → useTokenRefresh, useInactivityTimer, useInstitution,
                          useSaisieAbsences, useTimeout, useModalA11y, useCurrentUser
lib/
  api.ts                → apiFetch, refresh JWT, _forceLogout (NE PAS toucher sans test auth)
  api/<domaine>.ts      → méthodes d'API
  api/<domaine>-hooks.ts→ useXxxList/useXxx/useXxxMutations (28 domaines)
  auth.ts               → stockage user, RBAC (canAccess, isAdmin…), logout
  auth-roles.ts         → ALL, MANAGE, ADMIN_ONLY, SCOLARITE… pour le menu
  cache.ts              → cache mémoire à TTL — À PURGER À CHAQUE LOGOUT
  dev-mode.ts           → DEV_BYPASS_ENABLED (const tree-shakable ; garde double
                          NODE_ENV + variable explicite)
  file-validation.ts    → validateUpload() sur TOUT <input type="file">
  formatters.ts         → formatDate, formatNote, fmt — ne pas ré-implémenter
  ipgei-config.ts       → AFFICHER_MENU_LMD, GROUPES_NAV_LMD
  monitor.ts            → captureError/captureMessage. NO-OP EN PROD : rien n'est
                          remonté tant que Sentry n'est pas branché
  nav-config.ts         → NAV_GROUPS (ajouter une entrée de menu = ici)
  nav-filter.ts         → canSee, visibleItems, groupeActif, resolveGroups
  query-client.ts       → QueryClient singleton (utilisé par _forceLogout)
  safe-image.ts         → safeImageSrc — anti-XSS par liste blanche d'origines
  safe-redirect.ts      → safeNextUrl — anti open-redirect sur ?next=
```

## Pièges connus

- **0 erreur TS** : toute régression se corrige immédiatement.
  `npx tsc --noEmit` après chaque lot d'édits.
- **ESLint** : 0 erreur, ~121 avertissements résiduels (no-img-element,
  exhaustive-deps, unused vars). Ne pas en ajouter.
- **Aucun test** : 0 fichier `.test.*` / `.spec.*`. Toute modification en zone
  sensible — auth, RBAC, calculs de notes, délibérations — se valide par un
  scénario manuel écrit dans le PR. (Le backend, lui, a 56 fichiers de tests.)
- **`#006633` en dur dans 251 fichiers**, pas de jetons de design. Pour du code
  neuf, extraire une const locale.
- **`payement` (faute d'URL)** : 8 routes. Ne pas aggraver ; renommer en
  `paiement` dans un sprint dédié (URL + routes + liens de menu).
- **Types redéclarés** : 24 fichiers ont leur propre `interface Departement /
  Filiere / Prof`. Préférer `@/types/`.
- **Mode miroir** : `/dashboard/enseignant/{suivi,notes}` savent parler à une
  instance en lecture seule et déposer dans la boîte de réception. Ne pas y
  ajouter d'écriture directe sans lire `core/mirror.py` côté backend.

## Workflow

```bash
npm run dev                      # serveur de développement (port 3001)
npx tsc --noEmit                 # LA validation
npx eslint app lib components    # quand on touche un fichier
npx next build                   # avant toute mise en production

# Backend, dans un autre terminal
cd C:\SIR\IPGEI\backend_ipgei && .venv\Scripts\python.exe manage.py runserver
```

Pas de tests automatisés ici : validation = `tsc --noEmit` + scénarios manuels.

## Commits

`feat(domaine): …`, `fix(domaine): …`, `refactor(domaine): …`, `chore(deploy): …`
Message en français, expliquant **pourquoi** plutôt que quoi.

Un seul remote, `ipgei`. Branche `ipgei-main`, poussée aussi sur `main` :
```bash
git push ipgei ipgei-main && git push ipgei ipgei-main:main
```

## Pour les agents

- **Trois dépôts sur cette machine** : `frontend_ipgei` (ici),
  `backend_ipgei` (Django), et `C:\SIR\SIGA` — **interdit**, cf. en-tête.
- **Avant un refacto** : relever `npx tsc --noEmit | wc -l` pour ancrage. Si le
  compte augmente après l'édition, c'est une régression.
- **Vérifier avant d'affirmer.** Les chiffres de ce fichier ont déjà été faux
  pendant des mois parce qu'ils avaient été recopiés d'un état ancien.
- **`MEMORY.md`** dans `~/.claude/projects/.../memory/` porte l'historique des
  décisions. À lire avant tout changement structurel.
