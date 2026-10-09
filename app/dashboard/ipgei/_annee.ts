'use client';

/**
 * Sélecteur d'année universitaire, partagé par tous les écrans IPGEI.
 *
 * Sans année, un écran mélangerait les promotions : chaque page filtre donc sur
 * l'année courante. Le défaut vient de la session ; la liste des années réelles
 * est celle qui porte au moins une classe.
 */
import { useEffect, useState } from 'react';

import { getStoredUser } from '@/lib/auth';
import { useAnneesIPGEI } from '@/lib/api/ipgei-hooks';

/** Année universitaire déduite du calendrier : la rentrée bascule en septembre. */
export function anneeParDefaut(): string {
  const stockee = getStoredUser()?.annee_universitaire;
  if (stockee) return stockee;
  const maintenant = new Date();
  const debut = maintenant.getMonth() >= 8 ? maintenant.getFullYear() : maintenant.getFullYear() - 1;
  return `${debut}-${debut + 1}`;
}

/*
 * La PÉRIODE DE SESSION a vécu ici — `typeSemestreSession` et son libellé.
 *
 * Un seul réglage, choisi à la connexion, valait pour toute l'application :
 * donc pour les deux promotions à la fois. Le jour où les MP passent en S4
 * pendant que les MPSI sont encore en S1, il devient faux pour l'une des deux,
 * et l'écran s'ouvre vide sans rien expliquer.
 *
 * Les écrans IPGEI lisent désormais le calendrier de la classe consultée —
 * `edt/_semaines-classe.ts`. Ne pas réintroduire de filtre de période ici : ce
 * qui manque alors ne se voit pas, et c'est tout le problème.
 */

/**
 * `saisissables` : ne proposer que les années où une note peut encore être
 * écrite, c'est-à-dire dont un semestre au moins n'est pas clôturé. Les écrans
 * de saisie s'en servent — offrir une année close ne mènerait qu'à un refus à
 * l'enregistrement.
 */
export function useAnneeIPGEI(saisissables = false) {
  const [annee, setAnnee] = useState<string>('');
  const { data: annees = [], isLoading } = useAnneesIPGEI(saisissables);

  useEffect(() => {
    if (annee) return;
    const defaut = anneeParDefaut();
    // On préfère l'année de la session si elle existe côté données ; sinon la
    // plus récente réellement peuplée, pour ne jamais afficher un écran vide
    // alors que des classes existent.
    if (annees.includes(defaut)) setAnnee(defaut);
    else if (annees.length > 0)  setAnnee(annees[0]);
    else if (!isLoading)         setAnnee(defaut);
  }, [annees, isLoading, annee]);

  // Années proposées : celles qui ont des données. L'année par défaut n'y est
  // ajoutée que hors mode saisie — l'imposer alors qu'elle est close rouvrirait
  // le choix qu'on vient de fermer.
  const options = (saisissables || annees.includes(anneeParDefaut()))
    ? annees
    : [anneeParDefaut(), ...annees];

  return { annee, setAnnee, options, isLoading };
}
