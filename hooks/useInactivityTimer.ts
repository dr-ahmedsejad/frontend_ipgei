'use client';

import { useEffect, useRef, useState } from 'react';
import { CLE_STOCKAGE_ACTIVITE, derniereActivite, noterActivite } from '@/lib/session-partagee';

const INACTIVITY_MS = 20 * 60 * 1000;  // 20 minutes
const WARNING_MS    = 60 * 1000;        // afficher l'avertissement 1 min avant la déconnexion
const COUNTDOWN_S   = 60;

const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'];

/**
 * Détecte l'inactivité de l'utilisateur et déclenche un avertissement
 * 1 minute avant le logout automatique.
 *
 * L'INACTIVITÉ EST CELLE DE TOUS LES ONGLETS (lib/session-partagee.ts) : un
 * onglet SIGA oublié en arrière-plan ne déconnecte plus la session pendant
 * qu'on travaille dans un autre. Chaque onglet note son activité ; chacun
 * repart de zéro quand un autre est actif, et vérifie avant de déconnecter
 * qu'aucun onglet n'a servi depuis 20 minutes.
 *
 * @param onExpired Callback appelé après 20 min d'inactivité totale.
 * @returns showWarning + countdown (pour le modal) + dismissWarning (continuer la session)
 */
export function useInactivityTimer(onExpired: () => void) {
  const [showWarning, setShowWarning] = useState(false);
  const [countdown,   setCountdown]   = useState(COUNTDOWN_S);

  const inactivityRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warningRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef  = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    function clearAll() {
      if (inactivityRef.current)  clearTimeout(inactivityRef.current);
      if (warningRef.current)     clearTimeout(warningRef.current);
      if (countdownRef.current)   clearInterval(countdownRef.current);
    }

    /** Arme les minuteries pour qu'elles tombent `restant` ms après maintenant. */
    function armer(restant: number) {
      clearAll();
      setShowWarning(false);
      warningRef.current = setTimeout(() => {
        setShowWarning(true);
        setCountdown(COUNTDOWN_S);
        countdownRef.current = setInterval(() => {
          setCountdown(c => (c <= 1 ? (clearInterval(countdownRef.current!), 0) : c - 1));
        }, 1000);
      }, Math.max(0, restant - WARNING_MS));
      inactivityRef.current = setTimeout(() => {
        // Un autre onglet a peut-être servi entre-temps : on repart du dernier
        // geste connu, tous onglets confondus.
        const derniere = derniereActivite();
        const depuis = Date.now() - derniere;
        if (derniere && depuis < INACTIVITY_MS) {
          armer(INACTIVITY_MS - depuis);
          return;
        }
        onExpired();
      }, restant);
    }

    // Activité dans CET onglet : on la note pour les autres et on repart.
    function activiteIci() {
      noterActivite();
      armer(INACTIVITY_MS);
    }
    // Activité dans UN AUTRE onglet : on repart aussi, sans rien écrire.
    function activiteAilleurs(e: StorageEvent) {
      if (e.key === CLE_STOCKAGE_ACTIVITE) armer(INACTIVITY_MS);
    }

    ACTIVITY_EVENTS.forEach(ev =>
      window.addEventListener(ev, activiteIci, { passive: true }),
    );
    window.addEventListener('storage', activiteAilleurs);
    activiteIci();

    return () => {
      clearAll();
      ACTIVITY_EVENTS.forEach(ev => window.removeEventListener(ev, activiteIci));
      window.removeEventListener('storage', activiteAilleurs);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { showWarning, countdown, dismissWarning: () => setShowWarning(false) };
}
