'use client';

import { useSearchParams } from 'next/navigation';

/**
 * D'où l'on vient, quand un écran est atteignable depuis plusieurs modules.
 *
 * Le calendrier et la grille horaire sont communs : IPGEI les adresse au lieu
 * d'en tenir un double. Mais leur flèche de retour ramenait toujours aux
 * paramètres généraux, y compris pour qui arrivait de la rubrique du cursus —
 * on remontait d'un cran de trop sans l'avoir demandé. L'appelant se nomme
 * dans `?retour=`, l'écran d'arrivée sait alors où renvoyer.
 *
 * Une clé, pas une URL : une URL en paramètre serait une redirection ouverte.
 */
const ORIGINES = {
  cursus: { href: '/dashboard/parametres/cursus', libelle: 'Cursus prépa' },
} as const;

export type CleOrigine = keyof typeof ORIGINES;

export interface Retour {
  /** Où ramène la flèche. */
  href:    string;
  /** Ce qu'on y trouve, pour le title du lien. */
  libelle: string;
  /** À recoller sur les liens internes pour ne pas perdre l'origine. */
  suffixe: string;
}

/**
 * @param href    Retour par défaut, quand on n'arrive de nulle part en particulier.
 * @param libelle Nom de cette destination par défaut.
 */
export function useRetour(href: string, libelle: string): Retour {
  const cle = useSearchParams().get('retour');
  const origine = cle && cle in ORIGINES ? ORIGINES[cle as CleOrigine] : null;

  return origine
    ? { ...origine, suffixe: `?retour=${cle}` }
    : { href, libelle, suffixe: '' };
}
