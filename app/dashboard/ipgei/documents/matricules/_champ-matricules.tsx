'use client';

import { useMemo, useRef, useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { Loader2, X } from 'lucide-react';

import { inscriptionsApi } from '@/lib/api/ipgei';
import { ipgeiKeys } from '@/lib/api/ipgei-hooks';

/**
 * Saisie d'une liste de matricules, en pastilles — comme un champ de
 * destinataires.
 *
 * Un bloc de texte libre demandait de relire pour compter, et ne disait jamais
 * si « 242O11 » était bien « 242011 ». Une pastille par étudiant se compte
 * d'un regard, se retire d'un clic, et porte le NOM quand on l'a choisi dans
 * la liste : c'est le nom qui confirme qu'on a désigné la bonne personne, pas
 * le numéro.
 *
 * Ce qui reste possible et qu'on ne casse pas : coller vingt matricules d'un
 * coup. Le collage se découpe en pastilles au lieu d'être refusé — c'est le
 * geste le plus fréquent, il vient d'un tableur.
 */

export interface Pastille {
  matricule: string;
  /** Renseigné quand la pastille vient de la liste : c'est lui qui rassure. */
  nom?: string;
  classe?: string;
}

/** Le même découpage que le serveur, pour qu'un collage donne les mêmes lots. */
const decouper = (brut: string) =>
  brut.split(/[\s,;]+/).map(m => m.trim()).filter(Boolean);

export default function ChampMatricules({
  valeur, onChange, annee,
}: {
  valeur: Pastille[];
  onChange: (v: Pastille[]) => void;
  annee: string;
}) {
  const [saisie, setSaisie]     = useState('');
  const [ouvert, setOuvert]     = useState(false);
  const [surligne, setSurligne] = useState(0);
  const champ = useRef<HTMLInputElement>(null);

  const terme = saisie.trim();
  // DEUX CARACTÈRES AVANT D'INTERROGER. En deçà, la réponse rendrait la
  // promotion entière — et surtout, chaque frappe partirait au serveur pour
  // un résultat qu'on n'affiche pas. `keepPreviousData` évite que la liste
  // clignote entre deux lettres.
  const filtres = {
    search: terme, annee_universitaire: annee, actif: true, page_size: 8,
  };
  const { data: page, isFetching } = useQuery({
    queryKey:        ipgeiKeys.inscriptions.list(filtres),
    queryFn:         () => inscriptionsApi.list(filtres),
    enabled:         terme.length >= 2,
    placeholderData: keepPreviousData,
  });

  const dejaPris = useMemo(
    () => new Set(valeur.map(p => p.matricule)), [valeur]);

  const suggestions = useMemo(
    () => (terme.length < 2 ? [] : (page?.results ?? [])
      .filter(i => !dejaPris.has(i.etudiant_matricule))
      .slice(0, 8)),
    [page, terme, dejaPris],
  );

  const ajouter = (nouvelles: Pastille[]) => {
    const vus = new Set(valeur.map(p => p.matricule));
    const propres = nouvelles.filter(p => {
      if (!p.matricule || vus.has(p.matricule)) return false;
      vus.add(p.matricule);
      return true;
    });
    if (propres.length) onChange([...valeur, ...propres]);
  };

  const retirer = (matricule: string) =>
    onChange(valeur.filter(p => p.matricule !== matricule));

  /** Valide ce qui est tapé : la suggestion surlignée, ou le texte brut. */
  const valider = () => {
    const choisie = suggestions[surligne];
    if (choisie) {
      ajouter([{
        matricule: choisie.etudiant_matricule,
        nom:       choisie.etudiant_nom,
        classe:    choisie.classe_nom,
      }]);
    } else if (terme) {
      // Aucun nom : on ne sait pas encore si le numéro existe. On l'accepte —
      // le serveur tranchera et NOMMERA ce qui n'aboutit pas. Refuser ici
      // interdirait de préparer un lot hors ligne.
      ajouter(decouper(terme).map(m => ({ matricule: m })));
    }
    setSaisie('');
    setSurligne(0);
    setOuvert(false);
  };

  const auClavier = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Virgule, point-virgule, espace, Entrée, Tab : tout ce qu'on tape
    // naturellement pour dire « celui-là est fini ».
    if ([',', ';', ' ', 'Enter', 'Tab'].includes(e.key)) {
      if (!terme) return;
      e.preventDefault();
      valider();
      return;
    }
    if (e.key === 'Backspace' && !saisie && valeur.length) {
      // Retour arrière sur un champ vide : on retire la dernière pastille,
      // comme partout ailleurs.
      e.preventDefault();
      retirer(valeur[valeur.length - 1].matricule);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOuvert(true);
      setSurligne(s => Math.min(s + 1, Math.max(suggestions.length - 1, 0)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSurligne(s => Math.max(s - 1, 0));
    } else if (e.key === 'Escape') {
      setOuvert(false);
    }
  };

  const auCollage = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const colle = e.clipboardData.getData('text');
    if (!/[\s,;]/.test(colle)) return;      // un seul numéro : saisie normale
    e.preventDefault();
    ajouter(decouper(colle).map(m => ({ matricule: m })));
    setSaisie('');
  };

  return (
    <div className="relative">
      {/* Le cadre entier est cliquable : viser un champ d'un pixel de haut au
          bout d'une ligne de pastilles est pénible. */}
      <div onClick={() => champ.current?.focus()}
           className="min-h-[46px] w-full px-2 py-2 rounded-xl border border-gray-200
                      flex flex-wrap items-center gap-1.5 cursor-text
                      focus-within:ring-2 focus-within:ring-[#006633]/20
                      focus-within:border-[#006633]">
        {valeur.map(p => (
          <span key={p.matricule}
                title={p.nom ? `${p.nom}${p.classe ? ` — ${p.classe}` : ''}`
                             : 'Nom inconnu — il sera vérifié à la génération'}
                className={`inline-flex items-center gap-1.5 pl-2.5 pr-1 py-1 rounded-lg
                            text-xs font-medium border ${
                              p.nom
                                ? 'bg-[#006633]/8 border-[#006633]/25 text-[#005029]'
                                : 'bg-gray-50 border-gray-200 text-iss-gray'
                            }`}>
            <span className="font-mono">{p.matricule}</span>
            {p.nom && <span className="font-normal opacity-80">{p.nom}</span>}
            <button type="button" onClick={e => { e.stopPropagation(); retirer(p.matricule); }}
                    title={`Retirer ${p.matricule}`}
                    className="p-0.5 rounded hover:bg-black/10 transition-colors">
              <X size={11} />
            </button>
          </span>
        ))}

        <input ref={champ} value={saisie} spellCheck={false}
               onChange={e => { setSaisie(e.target.value); setOuvert(true); setSurligne(0); }}
               onKeyDown={auClavier} onPaste={auCollage}
               // Valider à la sortie : quitter le champ en laissant un numéro
               // tapé le perdrait sans rien dire.
               onBlur={() => { if (terme) valider(); setOuvert(false); }}
               placeholder={valeur.length ? '' : 'Matricule ou nom — collez aussi une liste entière'}
               className="flex-1 min-w-[180px] px-1.5 py-1 text-sm bg-transparent
                          outline-none placeholder:text-iss-gray/70" />

        {isFetching && terme.length >= 2 && (
          <Loader2 size={13} className="animate-spin text-iss-gray mr-1" />
        )}
      </div>

      {ouvert && suggestions.length > 0 && (
        <ul className="absolute z-20 mt-1 w-full max-h-64 overflow-y-auto rounded-xl
                       border border-gray-200 bg-white shadow-lg py-1">
          {suggestions.map((i, rang) => (
            <li key={i.id}>
              {/* `onMouseDown` et non `onClick` : le `blur` du champ part
                  avant le clic et fermerait la liste sous le curseur. */}
              <button type="button"
                      onMouseDown={e => {
                        e.preventDefault();
                        ajouter([{
                          matricule: i.etudiant_matricule,
                          nom:       i.etudiant_nom,
                          classe:    i.classe_nom,
                        }]);
                        setSaisie('');
                        setSurligne(0);
                      }}
                      onMouseEnter={() => setSurligne(rang)}
                      className={`w-full text-left px-3 py-2 flex items-baseline gap-2
                                  transition-colors ${
                                    rang === surligne ? 'bg-[#006633]/8' : 'hover:bg-gray-50'
                                  }`}>
                <span className="font-mono text-xs text-iss-dark">{i.etudiant_matricule}</span>
                <span className="text-sm text-iss-dark flex-1 truncate">{i.etudiant_nom}</span>
                <span className="text-xs text-iss-gray">{i.classe_nom}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
