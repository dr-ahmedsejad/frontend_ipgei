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

/**
 * Type de semestre de la session : `'I'` (impair) ou `'P'` (pair).
 *
 * L'utilisateur choisit sa période à la connexion — la redemander sur chaque
 * écran d'emploi du temps serait redondant, et permettrait surtout d'éditer une
 * période différente de celle qu'il croit consulter.
 */
export function typeSemestreSession(): 'I' | 'P' {
  return getStoredUser()?.semestre === 'Pairs' ? 'P' : 'I';
}

/** Libellé lisible de la période de session, pour l'afficher sans la rendre modifiable. */
export function libelleSemestreSession(): string {
  return typeSemestreSession() === 'P' ? 'Semestres pairs' : 'Semestres impairs';
}

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
