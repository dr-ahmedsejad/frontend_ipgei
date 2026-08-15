'use client';

/**
 * Champ de recherche à propositions — pour choisir UNE entrée dans une liste
 * trop longue pour un menu déroulant.
 *
 * Il se distingue des deux autres autocomplétions du module, et c'est
 * volontaire :
 *
 *   · `edt/_autocomplete.tsx` habille une CASE de grille horaire — 11 px,
 *     bordure fine, hauteur d'une ligne de tableau. Posé dans un formulaire, à
 *     côté d'un select et d'un bouton, il paraissait rétréci et mal aligné.
 *   · `notes/_champ-correcteur.tsx` laisse la saisie LIBRE : un correcteur peut
 *     ne pas être au fichier. Ici l'entrée doit exister — on transporte un
 *     identifiant, pas un texte.
 *
 * La recherche est confiée à l'appelant (`onSaisie`), qui la porte au serveur :
 * une liste d'une centaine de comptes ne se filtre pas en mémoire sans en
 * cacher la moitié.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Loader2, Search, X } from 'lucide-react';

import { useTimeout } from '@/hooks/useTimeout';
import { INPUT } from './_ui';

export interface Proposition {
  id:    string;
  /** Ce qu'on cherche des yeux — un nom, un intitulé. */
  label: string;
  /** Ce qui lève l'ambiguïté : un rôle, un code, une classe. */
  detail?: string;
}

export function ChampRecherche({
  value, propositions, onChange, onSaisie, placeholder,
  chargement = false, disabled = false, vide = 'Aucun résultat',
}: {
  value:        string;
  propositions: Proposition[];
  onChange:     (id: string) => void;
  onSaisie?:    (texte: string) => void;
  placeholder:  string;
  chargement?:  boolean;
  disabled?:    boolean;
  /** Ce qu'on affiche quand la recherche ne rend rien. */
  vide?:        string;
}) {
  const [texte, setTexte]   = useState('');
  const [ouvert, setOuvert] = useState(false);
  const [survol, setSurvol] = useState(-1);
  const fermeture = useTimeout();
  const champRef  = useRef<HTMLInputElement>(null);

  const choisie = useMemo(
    () => propositions.find(p => p.id === value) ?? null,
    [propositions, value],
  );

  // Le texte affiché suit la sélection : rouvrir le champ doit montrer ce qui
  // est retenu, pas la recherche qui y a mené.
  useEffect(() => {
    if (choisie) setTexte('');
  }, [choisie]);

  const saisir = (valeur: string) => {
    setTexte(valeur);
    setSurvol(-1);
    setOuvert(true);
    onSaisie?.(valeur);
    // Effacer la recherche libère la sélection : sans cela, le champ paraissait
    // vide tout en transportant encore l'ancien identifiant.
    if (!valeur && choisie) onChange('');
  };

  const choisir = (proposition: Proposition) => {
    onChange(proposition.id);
    setTexte('');
    setOuvert(false);
    setSurvol(-1);
    onSaisie?.('');
  };

  const effacer = () => {
    onChange('');
    setTexte('');
    onSaisie?.('');
    champRef.current?.focus();
  };

  const clavier = (evenement: React.KeyboardEvent<HTMLInputElement>) => {
    if (evenement.key === 'Escape') { setOuvert(false); return; }
    if (evenement.key === 'Backspace' && !texte && choisie) { effacer(); return; }
    if (!ouvert || !propositions.length) return;
    if (evenement.key === 'ArrowDown') {
      evenement.preventDefault();
      setSurvol(rang => (rang + 1) % propositions.length);
    } else if (evenement.key === 'ArrowUp') {
      evenement.preventDefault();
      setSurvol(rang => (rang <= 0 ? propositions.length : rang) - 1);
    } else if (evenement.key === 'Enter' && survol >= 0) {
      evenement.preventDefault();
      choisir(propositions[survol]);
    }
  };

  const listeVisible = ouvert && !disabled;

  return (
    <div className="relative">
      <div className="relative flex items-center">
        <Search size={14}
                className="absolute left-3 text-iss-gray pointer-events-none" />
        <input
          ref={champRef}
          value={choisie && !texte ? choisie.label : texte}
          placeholder={placeholder}
          disabled={disabled}
          className={`${INPUT} pl-9 ${choisie ? 'pr-9 font-medium' : 'pr-9'}`}
          style={choisie ? { borderColor: '#006633', background: '#fff' } : undefined}
          role="combobox"
          aria-expanded={listeVisible}
          aria-autocomplete="list"
          onChange={e => saisir(e.target.value)}
          onFocus={() => setOuvert(true)}
          // Fermeture différée : sans ce délai, le blur précède le clic sur la
          // proposition et la sélection ne se ferait jamais.
          onBlur={() => fermeture.set(() => setOuvert(false), 160)}
          onKeyDown={clavier}
        />
        {chargement ? (
          <Loader2 size={14} className="absolute right-3 animate-spin text-iss-gray" />
        ) : choisie ? (
          <button type="button" onClick={effacer} aria-label="Effacer la sélection"
                  className="absolute right-2 p-1 rounded-lg text-iss-gray
                             hover:bg-gray-100 hover:text-red-600 transition-colors">
            <X size={13} />
          </button>
        ) : null}
      </div>

      {listeVisible && (
        <ul className="absolute z-30 top-full mt-1.5 w-full max-h-64 overflow-y-auto
                       bg-white rounded-xl shadow-lg border border-gray-100"
            role="listbox">
          {propositions.length === 0 ? (
            <li className="px-3 py-2.5 text-xs text-iss-gray">
              {chargement ? 'Recherche…' : vide}
            </li>
          ) : propositions.map((proposition, rang) => {
            const retenue = proposition.id === value;
            return (
              <li key={proposition.id}>
                <button type="button"
                        role="option"
                        aria-selected={retenue}
                        onMouseDown={() => choisir(proposition)}
                        onMouseEnter={() => setSurvol(rang)}
                        className={`w-full flex items-center gap-2 px-3 py-2 text-left
                                    border-b border-gray-50 last:border-0 transition-colors ${
                          rang === survol ? 'bg-[#006633]/8' : 'hover:bg-gray-50'}`}>
                  <span className="flex-1 min-w-0">
                    <span className={`block text-sm truncate ${
                      retenue ? 'text-[#006633] font-semibold' : 'text-iss-dark'}`}>
                      {proposition.label}
                    </span>
                    {proposition.detail && (
                      <span className="block text-[11px] text-iss-gray truncate">
                        {proposition.detail}
                      </span>
                    )}
                  </span>
                  {retenue && <Check size={13} className="text-[#006633] shrink-0" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
