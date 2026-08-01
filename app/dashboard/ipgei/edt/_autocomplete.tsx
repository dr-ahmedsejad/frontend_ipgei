'use client';

/**
 * Autocomplétion de cellule d'emploi du temps.
 *
 * Reprise à l'identique du comportement de la grille « Gérer emplois » de SIGA
 * (`app/dashboard/emplois/gerer/page.tsx`) : saisie libre filtrante, liste
 * déroulante au focus, bordure bleue quand la case est remplie. L'objectif est
 * qu'un utilisateur passant de SIGA à IPGEI retrouve exactement les mêmes gestes.
 */
import { useEffect, useRef, useState } from 'react';

import { useTimeout } from '@/hooks/useTimeout';

export interface OptionAC { id: string; label: string }

export function AC({
  value, options, onChange, placeholder, disabled,
}: {
  value:       string;
  options:     OptionAC[];
  onChange:    (id: string) => void;
  placeholder: string;
  disabled?:   boolean;
}) {
  const [texte, setTexte]     = useState('');
  const [ouvert, setOuvert]   = useState(false);
  const [filtre, setFiltre]   = useState<OptionAC[]>([]);
  const inputRef  = useRef<HTMLInputElement>(null);
  const blurTimer = useTimeout();

  /**
   * Le texte affiché suit la valeur sélectionnée.
   *
   * `options` est volontairement HORS des dépendances : les appelants la
   * construisent en ligne (`optProfs.filter(...)`), donc elle change d'identité
   * à chaque rendu. L'y laisser relançait l'effet en continu — ce qui écrasait
   * la saisie en cours dès qu'un autre champ de la grille se mettait à jour, et
   * pouvait faire boucler le rendu. Seule la valeur compte ici ; le libellé
   * s'en déduit.
   */
  useEffect(() => {
    const opt = options.find(o => o.id === value);
    setTexte(opt ? opt.label : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const saisir = (e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value;
    setTexte(q);
    setFiltre(q ? options.filter(o => o.label.toLowerCase().includes(q.toLowerCase())) : options);
    setOuvert(true);
    if (!q) onChange('');
  };

  const focus = () => { setFiltre(options); setOuvert(true); };

  // Fermeture différée : sans ce délai, le blur précède le clic sur l'option et
  // la sélection ne se ferait jamais.
  const blur = () => {
    blurTimer.set(() => {
      const exact = options.find(o => o.label.toLowerCase() === texte.toLowerCase());
      if (!exact && texte) {
        const courant = options.find(o => o.id === value);
        setTexte(courant ? courant.label : '');
      }
      setOuvert(false);
    }, 180);
  };

  const choisir = (opt: OptionAC) => { setTexte(opt.label); onChange(opt.id); setOuvert(false); };

  return (
    <div style={{ position: 'relative', marginBottom: 3 }}>
      <input
        ref={inputRef} type="text" value={texte} disabled={disabled}
        onChange={saisir} onFocus={focus} onBlur={blur}
        placeholder={placeholder} spellCheck={false} autoComplete="off"
        style={{
          width: '100%', padding: '3px 5px', fontSize: 11,
          border: texte ? '1px solid #3498db' : '1px solid #ccc',
          borderRadius: 4, background: disabled ? '#f1f1f1' : (texte ? '#f8f9fa' : 'white'),
          outline: 'none', boxSizing: 'border-box',
        }}
      />
      {ouvert && filtre.length > 0 && (
        <ul style={{
          position: 'absolute', zIndex: 9999, left: 0, right: 0, top: '100%',
          background: 'white', border: '1px solid #ccc', borderTop: 'none',
          borderRadius: '0 0 4px 4px', maxHeight: 160, overflowY: 'auto',
          boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
          padding: 0, margin: 0, listStyle: 'none',
        }}>
          {filtre.map(opt => (
            <li key={opt.id} onMouseDown={() => choisir(opt)}
                style={{ padding: '4px 8px', fontSize: 11, cursor: 'pointer', borderBottom: '1px solid #f0f0f0' }}
                onMouseEnter={e => (e.currentTarget.style.background = '#eaf4fd')}
                onMouseLeave={e => (e.currentTarget.style.background = 'white')}>
              {opt.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
