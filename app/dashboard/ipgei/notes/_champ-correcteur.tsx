'use client';

/**
 * Champ « nom du correcteur », complété depuis la table des enseignants.
 *
 * La saisie reste LIBRE. Un correcteur n'est pas toujours au fichier —
 * vacataire recruté pour la session, enseignant d'un autre établissement
 * appelé en renfort — et imposer une sélection aurait obligé à créer une fiche
 * professeur avant de pouvoir imprimer une feuille de collecte. La liste
 * propose, elle ne contraint pas.
 *
 * Ce n'est pas le composant `AC` de l'emploi du temps : celui-là rend un
 * IDENTIFIANT et refuse tout ce qui n'est pas dans sa liste. Ici la valeur
 * transportée est le nom lui-même, tel qu'il s'imprimera sur la fiche.
 */
import { useMemo, useRef, useState } from 'react';

import { useTimeout } from '@/hooks/useTimeout';
import { INPUT } from '../_ui';

/** Sans accents ni casse : « Sejad » doit trouver « SÉJAD ». */
function aplatir(texte: string): string {
  return texte.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

export function ChampCorrecteur({
  valeur, noms, onChange, placeholder = 'Nom du correcteur',
}: {
  valeur:       string;
  /** Les enseignants au fichier, déjà dédoublonnés et triés. */
  noms:         string[];
  onChange:     (nom: string) => void;
  placeholder?: string;
}) {
  const [ouvert, setOuvert]   = useState(false);
  const [survol, setSurvol]   = useState(-1);
  const fermeture = useTimeout();
  const champRef  = useRef<HTMLInputElement>(null);

  const proposes = useMemo(() => {
    const cherche = aplatir(valeur.trim());
    // Champ vide : on montre le début de la liste plutôt que rien — c'est ce
    // qui fait comprendre qu'il y a une liste.
    const retenus = cherche
      ? noms.filter(n => aplatir(n).includes(cherche))
      : noms;
    return retenus.slice(0, 8);
  }, [noms, valeur]);

  // Un nom déjà exactement saisi n'a pas à être reproposé sous le champ.
  const exact = proposes.length === 1 && aplatir(proposes[0]) === aplatir(valeur.trim());
  const visible = ouvert && proposes.length > 0 && !exact;

  const choisir = (nom: string) => {
    onChange(nom);
    setOuvert(false);
    setSurvol(-1);
    champRef.current?.blur();
  };

  const clavier = (evenement: React.KeyboardEvent<HTMLInputElement>) => {
    if (evenement.key === 'Escape') { setOuvert(false); return; }
    if (!visible) return;
    if (evenement.key === 'ArrowDown') {
      evenement.preventDefault();
      setSurvol(rang => (rang + 1) % proposes.length);
    } else if (evenement.key === 'ArrowUp') {
      evenement.preventDefault();
      setSurvol(rang => (rang <= 0 ? proposes.length : rang) - 1);
    } else if (evenement.key === 'Enter' && survol >= 0) {
      // Uniquement quand une proposition est SURVOLÉE : sinon Entrée doit
      // valider ce que l'agent a tapé, y compris un nom hors fichier.
      evenement.preventDefault();
      choisir(proposes[survol]);
    }
  };

  return (
    <div className="relative flex-1">
      <input
        ref={champRef}
        value={valeur}
        placeholder={placeholder}
        className={`${INPUT} w-full`}
        role="combobox"
        aria-expanded={visible}
        aria-autocomplete="list"
        onChange={e => { onChange(e.target.value); setOuvert(true); setSurvol(-1); }}
        onFocus={() => setOuvert(true)}
        // Fermeture différée : sans ce délai, le blur précède le clic sur
        // l'option et la sélection ne se ferait jamais.
        onBlur={() => fermeture.set(() => setOuvert(false), 150)}
        onKeyDown={clavier}
      />
      {visible && (
        <ul className="absolute z-20 top-full mt-1 w-full bg-white rounded-xl
                       shadow-lg border border-gray-100 overflow-hidden"
            role="listbox">
          {proposes.map((nom, rang) => (
            <li key={nom}>
              <button type="button"
                      role="option"
                      aria-selected={rang === survol}
                      onMouseDown={() => choisir(nom)}
                      onMouseEnter={() => setSurvol(rang)}
                      className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                        rang === survol ? 'bg-[#006633]/10 text-[#006633]' : 'text-iss-dark'}`}>
                {nom}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
