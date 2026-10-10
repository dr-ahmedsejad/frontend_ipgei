/**
 * Le nom affiché d'une famille de séances, dans les écrans d'avancement.
 *
 * « CM », « TD », « TP », « PR » sont des CLÉS, pas des étiquettes. Le serveur
 * les emploie pour ranger les heures en familles, pour les pondérer — CM = 1,
 * TD et TP = 2/3 — et pour retrouver le taux de paiement correspondant. On ne
 * les renomme donc nulle part : on leur donne un nom d'affichage ici, et c'est
 * lui que les en-têtes et les pastilles montrent.
 *
 * Seul « CM » en reçoit un. Les autres sigles se lisent bien et tiennent dans
 * des colonnes étroites ; ajouter une entrée suffirait à en renommer un autre.
 *
 * Ne pas s'en servir pour indexer une couleur ou interroger des données : ces
 * accès-là passent par le code, toujours.
 */
const NOMS: Record<string, string> = {
  CM: 'Cours',
};

export function nomFamille(famille: string): string {
  return NOMS[famille] ?? famille;
}
