/**
 * Helpers d'affichage compact des départements.
 *
 * Règle métier : quand plusieurs départements partagent même filière ET niveau,
 * on les regroupe en "FIL - NIV (G1 / G2)" au lieu de "FIL - NIV - G1 / FIL - NIV - G2".
 * Un département solitaire garde son format complet "FIL - NIV - NOM".
 *
 * Deux allègements, tous deux commandés par les DONNÉES et non par un choix
 * figé — un établissement qui se diversifierait les verrait disparaître d'eux-mêmes :
 *
 *   · le code de filière tombe quand l'établissement n'en a qu'UNE. Il ne
 *     distingue alors rien et se répète sur chaque ligne : « IPGEI - MPSI -
 *     MPSI A » pour toutes les classes, quand « MPSI A » suffit.
 *   · le niveau tombe quand le nom de la classe le porte déjà. À l'IPGEI les
 *     classes se nomment d'après leur niveau — « MPSI - MPSI A » le disait deux
 *     fois.
 *
 * Utilisé dans /dashboard/suivi/remplissage, /dashboard/payement/liste, etc.
 */

export interface DeptInfo {
  id?:           number;
  nom:           string;
  groupe?:       string | null;
  niveau_nom?:   string | null;
  filiere_code?: string | null;
}

/**
 * Le code de filière apporte-t-il une information ?
 *
 * Non s'il n'y en a qu'un dans tout le référentiel chargé : il est alors
 * constant, et une constante répétée à chaque ligne n'apprend rien. Le calcul
 * porte sur la Map ENTIÈRE, pas sur la séance affichée — sinon le préfixe
 * apparaîtrait et disparaîtrait d'une ligne à l'autre.
 */
function filiereDistingue(deptByNom: Map<string, DeptInfo>): boolean {
  const codes = new Set<string>();
  for (const d of deptByNom.values()) {
    if (d.filiere_code) codes.add(d.filiere_code);
    if (codes.size > 1) return true;
  }
  return false;
}

/** Le nom de la classe redit-il déjà son niveau ? (« MPSI A » pour MPSI) */
function nomPorteLeNiveau(nom: string, niveau: string): boolean {
  if (!niveau) return false;
  const n = nom.trim().toLowerCase();
  const v = niveau.trim().toLowerCase();
  return n === v || n.startsWith(`${v} `) || n.startsWith(`${v}-`);
}

/**
 * Libellé d'UN département : « FILIÈRE - NIVEAU - NOM », allégé des mêmes
 * redites que `formatDeptNoms`.
 *
 * Dix écrans en portaient chacun leur copie — `[filiere_code, niveau_nom, nom]
 * .filter(Boolean).join(' - ')` recopié à l'identique. Dix copies, c'est dix
 * occasions de diverger : la règle change ici, et partout.
 *
 * `tous` sert à savoir si la filière distingue quelque chose. Omis, le libellé
 * la garde — un appelant qui n'a qu'un département ne peut pas en juger.
 */
export function deptLabel(d: DeptInfo, tous?: Iterable<DeptInfo>): string {
  const codes = new Set<string>();
  if (tous) {
    for (const x of tous) if (x.filiere_code) codes.add(x.filiere_code);
  }
  const filiere = (tous && codes.size <= 1) ? '' : (d.filiere_code ?? '');
  const niveau  = nomPorteLeNiveau(d.nom, d.niveau_nom ?? '') ? '' : (d.niveau_nom ?? '');
  return [filiere, niveau, d.nom].filter(Boolean).join(' - ');
}


/**
 * Compose la chaîne d'affichage d'une liste de dept_noms (string[]) en utilisant
 * une Map<nom, DeptInfo> pour récupérer filière/niveau/groupe.
 */
export function formatDeptNoms(
  deptNoms: string[],
  deptByNom: Map<string, DeptInfo>,
): string {
  if (deptNoms.length === 0) return '—';
  const avecFiliere = filiereDistingue(deptByNom);

  const items = deptNoms.map(nom => {
    const d = deptByNom.get(nom);
    return {
      nom,
      filiere_code: avecFiliere ? (d?.filiere_code ?? '') : '',
      niveau_nom:   d?.niveau_nom ?? '',
      groupe:       d?.groupe ?? '',
    };
  });
  // Regroupement par (filiere_code, niveau_nom)
  const groups = new Map<string, typeof items>();
  for (const it of items) {
    const key = `${it.filiere_code}|${it.niveau_nom}`;
    const arr = groups.get(key) ?? [];
    arr.push(it);
    groups.set(key, arr);
  }
  return Array.from(groups.values()).map(grp => {
    const head   = grp[0];
    // Seul cas où le niveau s'efface : une classe unique dont le nom le porte
    // déjà. Un regroupement « (A / B) » garde le sien — c'est lui qui dit de
    // quel niveau sont ces groupes.
    const seul   = grp.length === 1;
    const niveau = seul && nomPorteLeNiveau(head.nom, head.niveau_nom)
      ? '' : head.niveau_nom;
    const prefix = [head.filiere_code, niveau].filter(Boolean).join(' - ');
    if (seul) {
      return [prefix, head.nom].filter(Boolean).join(' - ');
    }
    const parts = grp.map(d => d.groupe || d.nom);
    return prefix ? `${prefix} (${parts.join(' / ')})` : parts.join(' / ');
  }).join(' / ');
}
