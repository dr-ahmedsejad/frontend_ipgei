import { formatDateTime } from '@/lib/formatters';
import type { Deliberation } from '@/types/ipgei';

/**
 * Où en est le jury, et depuis quand.
 *
 * Une seule mention plutôt que deux dates côte à côte : la validation succède
 * au calcul, l'afficher avec lui ferait lire deux étapes en cours à la fois.
 * C'est la dernière qui compte.
 *
 * L'HEURE y figure, pas seulement le jour : on recalcule plusieurs fois dans
 * une même séance — en essayant un autre seuil, par exemple — et « calculée le
 * 06/08 » ne dirait pas si le tableau à l'écran est d'avant ou d'après le
 * dernier essai.
 */
export function etatDeliberation(d: Deliberation): { libelle: string; date: string } {
  if (d.date_validation) {
    return { libelle: 'Validée le', date: formatDateTime(d.date_validation) };
  }
  if (d.date_calcul) {
    return { libelle: 'Calculée le', date: formatDateTime(d.date_calcul) };
  }
  return { libelle: 'Jamais calculée', date: '' };
}

/** La même chose en une phrase, pour une ligne de liste. */
export function resumeEtat(d: Deliberation): string {
  const { libelle, date } = etatDeliberation(d);
  return date ? `${libelle.toLowerCase()} ${date}` : libelle.toLowerCase();
}
