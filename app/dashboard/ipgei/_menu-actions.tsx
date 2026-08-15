'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Loader2 } from 'lucide-react';

import { BTN_SECONDAIRE } from './_ui';

/**
 * Menu d'actions secondaires — le tiroir des éditions.
 *
 * Une barre d'écran ne doit porter qu'une action principale : celle que l'état
 * courant appelle. Le jury de deuxième année en alignait jusqu'à huit du même
 * poids — PV, PV Excel, PV final, PV final Excel, détail des notes — et le
 * bouton du moment s'y noyait. Elles ne disparaissent pas : elles se replient.
 *
 * Fermeture au clic extérieur ET à Échap : un menu qui ne se ferme qu'en
 * recliquant sur son bouton se retrouve ouvert derrière une modale.
 */
export interface ActionMenu {
  label:     string;
  Icone:     React.ElementType;
  onClick:   () => void;
  /** Le sablier remplace l'icône : éditer un PV prend plusieurs secondes. */
  enCours?:  boolean;
  desactive?: boolean;
  /** Pourquoi l'action est indisponible — jamais un bouton mort sans motif. */
  motif?:    string;
}

export function MenuActions({ label, Icone, actions, largeur = 232 }: {
  label:    string;
  Icone:    React.ElementType;
  actions:  ActionMenu[];
  largeur?: number;
}) {
  const [ouvert, setOuvert] = useState(false);
  const boite = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ouvert) return;
    const auClic = (e: MouseEvent) => {
      if (!boite.current?.contains(e.target as Node)) setOuvert(false);
    };
    const auClavier = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOuvert(false);
    };
    document.addEventListener('mousedown', auClic);
    document.addEventListener('keydown', auClavier);
    return () => {
      document.removeEventListener('mousedown', auClic);
      document.removeEventListener('keydown', auClavier);
    };
  }, [ouvert]);

  if (actions.length === 0) return null;

  // Une action en cours se voit sur le bouton refermé : sinon le menu paraît
  // n'avoir rien déclenché.
  const travaille = actions.some(a => a.enCours);

  return (
    <div ref={boite} className="relative inline-block">
      <button type="button" onClick={() => setOuvert(o => !o)}
              aria-haspopup="menu" aria-expanded={ouvert}
              className={BTN_SECONDAIRE}>
        {travaille
          ? <Loader2 size={14} className="animate-spin" />
          : <Icone size={14} />}
        {label}
        <ChevronDown size={13}
                     className={`transition-transform ${ouvert ? 'rotate-180' : ''}`} />
      </button>

      {ouvert && (
        <div role="menu"
             className="absolute right-0 z-30 mt-1 rounded-xl border border-gray-100
                        bg-white shadow-lg overflow-hidden py-1"
             style={{ width: largeur }}>
          {actions.map(action => (
            <button key={action.label} role="menuitem" type="button"
                    title={action.desactive ? action.motif : undefined}
                    disabled={action.desactive || action.enCours}
                    onClick={() => { setOuvert(false); action.onClick(); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm
                               text-iss-dark hover:bg-gray-50 transition-colors
                               disabled:opacity-40 disabled:cursor-not-allowed">
              {action.enCours
                ? <Loader2 size={14} className="animate-spin text-[#006633]" />
                : <action.Icone size={14} className="text-[#006633]" />}
              <span className="flex-1">{action.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
