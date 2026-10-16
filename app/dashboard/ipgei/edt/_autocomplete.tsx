'use client';

/**
 * Autocomplétion de cellule d'emploi du temps.
 *
 * Reprise du comportement de la grille « Gérer emplois » de SIGA
 * (`app/dashboard/emplois/gerer/page.tsx`) : saisie libre filtrante, liste
 * déroulante au focus, bordure bleue quand la case est remplie. L'objectif est
 * qu'un utilisateur passant de SIGA à IPGEI retrouve exactement les mêmes gestes.
 *
 * Deux défauts corrigés depuis, qui tenaient tous deux au fait que la sélection
 * n'existait qu'à la souris :
 *
 *  - **Le champ pouvait mentir.** Taper le libellé EXACT — « MATH », une salle
 *    « A1 » — puis Tab ne sélectionnait rien : `onChange` n'était appelé que
 *    par un clic. Or la bordure « rempli » suit le TEXTE affiché, pas la
 *    valeur : le champ avait l'air renseigné et ne l'était pas. Sur la matière,
 *    c'est elle qui matérialise la case — la séance n'était pas créée.
 *
 *  - **Le clavier ne servait à rien.** Ni flèches, ni Entrée, ni Échap, et les
 *    options ne réagissaient qu'à `onMouseDown`. Sur une grille où l'on
 *    enchaîne quatre champs par case, c'est le geste le plus fréquent qui était
 *    le moins servi.
 */
import { useEffect, useId, useRef, useState } from 'react';

import { useTimeout } from '@/hooks/useTimeout';

export interface OptionAC {
  id:    string;
  label: string;
  /**
   * Pourquoi ce choix est impossible ici — « pris (MPSI B · B1) ». L'option
   * reste dans la liste, grisée et inerte : un nom qui disparaît se lit comme
   * un oubli du référentiel, un nom grisé qui dit où il est pris se comprend
   * tout seul.
   */
  indisponible?: string;
}

/** Entre deux groupes qui tiennent le même nom : « MPSI A et MPSI B · B1 ». */
const ET = ' et ';

/**
 * Retient qu'un enseignant ou une salle est pris par `groupe`. Un même nom
 * tenu par deux groupes — une donnée ancienne, d'avant le contrôle du
 * serveur — les nomme tous les deux : n'en citer qu'un laissait chercher au
 * mauvais endroit.
 */
export const noterPris = (m: Map<string, string>, id: string, groupe: string) => {
  const deja = m.get(id);
  if (!deja) m.set(id, groupe);
  else if (!deja.split(ET).includes(groupe)) m.set(id, `${deja}${ET}${groupe}`);
};

/**
 * Marque « pris (…) » les options occupées ailleurs (id → groupe qui les
 * tient). Celle déjà choisie reste sélectionnable : c'est la sienne.
 */
export const avecDispo = (options: OptionAC[], occupes: Map<string, string> | undefined,
                          choisi: string): OptionAC[] =>
  occupes && occupes.size
    ? options.map(o => (occupes.has(o.id) && o.id !== choisi
        ? { ...o, indisponible: `pris (${occupes.get(o.id)})` } : o))
    : options;

/** Les choix possibles d'abord, les indisponibles ensuite. */
const disponiblesDAbord = (opts: OptionAC[]) =>
  [...opts.filter(o => !o.indisponible), ...opts.filter(o => o.indisponible)];

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
  /** Option sous le curseur clavier ; -1 = aucune. */
  const [actif, setActif]     = useState(-1);
  const inputRef  = useRef<HTMLInputElement>(null);
  const listeRef  = useRef<HTMLUListElement>(null);
  const blurTimer = useTimeout();
  const idListe   = useId();

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

  /**
   * L'option dont le libellé est exactement le texte saisi, casse ignorée.
   * Un nom indisponible tapé en entier ne vaut pas choix : le serveur le
   * refuserait à l'enregistrement.
   */
  const exacte = (t: string) =>
    options.find(o => !o.indisponible && o.label.toLowerCase() === t.trim().toLowerCase());

  const saisir = (e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value;
    setTexte(q);
    setFiltre(disponiblesDAbord(
      q ? options.filter(o => o.label.toLowerCase().includes(q.toLowerCase())) : options));
    setOuvert(true);
    setActif(-1);
    if (!q) onChange('');
  };

  const focus = () => { setFiltre(disponiblesDAbord(options)); setOuvert(true); setActif(-1); };

  /**
   * Les indisponibles sont en fin de liste : le curseur clavier ne parcourt
   * que les choix possibles, il ne s'arrête jamais sur un nom grisé.
   */
  const nbChoisissables = filtre.filter(o => !o.indisponible).length;

  /**
   * Fermeture différée : sans ce délai, le blur précède le clic sur l'option et
   * la sélection ne se ferait jamais.
   *
   * Un libellé exactement saisi VAUT une sélection. Sans cela, quitter le champ
   * au clavier laissait la valeur vide sous un champ d'apparence remplie.
   */
  const blur = () => {
    blurTimer.set(() => {
      const opt = exacte(texte);
      if (opt) {
        if (opt.id !== value) onChange(opt.id);
        setTexte(opt.label);
      } else if (texte) {
        const courant = options.find(o => o.id === value);
        setTexte(courant ? courant.label : '');
      }
      setOuvert(false);
      setActif(-1);
    }, 180);
  };

  const choisir = (opt: OptionAC) => {
    setTexte(opt.label); onChange(opt.id); setOuvert(false); setActif(-1);
  };

  const auClavier = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      // Revenir à la valeur retenue : Échap annule la saisie en cours, il ne
      // vide pas la case.
      const courant = options.find(o => o.id === value);
      setTexte(courant ? courant.label : '');
      setOuvert(false); setActif(-1);
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!ouvert) {
        const liste = disponiblesDAbord(options);
        setFiltre(liste); setOuvert(true);
        setActif(liste.some(o => !o.indisponible) ? 0 : -1);
        return;
      }
      if (nbChoisissables === 0) return;
      const pas = e.key === 'ArrowDown' ? 1 : -1;
      setActif(i => (i + pas + nbChoisissables) % nbChoisissables);
      return;
    }
    if (e.key === 'Enter') {
      // Pas de formulaire ici, mais Entrée ne doit rien déclencher d'autre.
      e.preventDefault();
      if (ouvert && actif >= 0 && filtre[actif] && !filtre[actif].indisponible) {
        choisir(filtre[actif]); return;
      }
      const opt = exacte(texte);
      if (opt) choisir(opt);
      return;
    }
    if (e.key === 'Tab' && ouvert && actif >= 0 && filtre[actif]
        && !filtre[actif].indisponible) {
      // Tab valide ce qui est sous le curseur : c'est ce qu'on attend en
      // enchaînant les champs d'une case.
      choisir(filtre[actif]);
    }
  };

  // Garder l'option active visible quand on parcourt une longue liste.
  useEffect(() => {
    if (actif < 0 || !listeRef.current) return;
    const ligne = listeRef.current.children[actif] as HTMLElement | undefined;
    ligne?.scrollIntoView({ block: 'nearest' });
  }, [actif]);

  return (
    <div style={{ position: 'relative', marginBottom: 3 }}>
      <input
        ref={inputRef} type="text" value={texte} disabled={disabled}
        onChange={saisir} onFocus={focus} onBlur={blur} onKeyDown={auClavier}
        placeholder={placeholder} spellCheck={false} autoComplete="off"
        role="combobox" aria-expanded={ouvert} aria-controls={idListe}
        aria-autocomplete="list" aria-label={placeholder}
        aria-activedescendant={
          ouvert && actif >= 0 && filtre[actif] ? `${idListe}-${filtre[actif].id}` : undefined
        }
        style={{
          width: '100%', padding: '3px 5px', fontSize: 11,
          border: texte ? '1px solid #3498db' : '1px solid #ccc',
          borderRadius: 4, background: disabled ? '#f1f1f1' : (texte ? '#f8f9fa' : 'white'),
          outline: 'none', boxSizing: 'border-box',
        }}
      />
      {ouvert && filtre.length > 0 && (
        <ul ref={listeRef} id={idListe} role="listbox" style={{
          position: 'absolute', zIndex: 9999, left: 0, right: 0, top: '100%',
          background: 'white', border: '1px solid #ccc', borderTop: 'none',
          borderRadius: '0 0 4px 4px', maxHeight: 160, overflowY: 'auto',
          boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
          padding: 0, margin: 0, listStyle: 'none',
        }}>
          {filtre.map((opt, i) => opt.indisponible ? (
            // `preventDefault` : le clic ne doit même pas retirer le focus du
            // champ — sinon la liste se fermerait sur un choix refusé.
            <li key={opt.id} id={`${idListe}-${opt.id}`} role="option"
                aria-selected={false} aria-disabled="true"
                title={`${opt.label} — ${opt.indisponible}`}
                onMouseDown={e => e.preventDefault()}
                style={{
                  padding: '4px 8px', fontSize: 11, cursor: 'not-allowed',
                  borderBottom: '1px solid #f0f0f0',
                  color: '#9ca3af', background: '#f9fafb',
                }}>
              {opt.label}{' '}
              <span style={{ fontStyle: 'italic' }}>— {opt.indisponible}</span>
            </li>
          ) : (
            // `onMouseDown` et non `onClick` : le blur du champ précède le clic,
            // et fermerait la liste avant que la sélection n'arrive.
            <li key={opt.id} id={`${idListe}-${opt.id}`} role="option"
                aria-selected={i === actif}
                onMouseDown={() => choisir(opt)}
                onMouseEnter={() => setActif(i)}
                style={{
                  padding: '4px 8px', fontSize: 11, cursor: 'pointer',
                  borderBottom: '1px solid #f0f0f0',
                  background: i === actif ? '#eaf4fd' : 'white',
                }}>
              {opt.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
