'use client';

import { useEffect, useRef, useState } from 'react';
import { Search, User, X } from 'lucide-react';

import { useTimeout } from '@/hooks/useTimeout';
import { useInscriptions } from '@/lib/api/ipgei-hooks';
import type { Inscription } from '@/types/ipgei';

/**
 * Champ de recherche d'un inscrit — un seul champ, rien d'autre.
 *
 * Le premier jet posait un filtre par classe et la liste complète des
 * inscrits, dépliée en permanence : sur une promotion entière, il fallait
 * défiler pour trouver quelqu'un dont on connaît le matricule. On tape, on
 * choisit, le champ se referme sur le nom retenu.
 *
 * Partagé par l'émission d'un document et la consultation des notes : les deux
 * commencent par désigner le même étudiant, et deux champs séparés auraient
 * fini par ne plus chercher de la même façon.
 *
 * Repris de l'interaction d'`EtudiantPicker` (recherche du socle) : même
 * temporisation, même pastille verte une fois choisi, même croix pour défaire.
 * La source diffère — ici une INSCRIPTION de l'année visée, et non un étudiant
 * du référentiel : c'est elle que le relevé et les documents demandent.
 */

/** En deçà de deux caractères, la recherche rendrait la promotion entière. */
const MINIMUM = 2;

export default function ChoixInscription({
  annee, choisi, onChoisir, titre = "Étudiant (matricule ou nom)",
}: {
  annee:     string;
  choisi:    Inscription | null;
  onChoisir: (i: Inscription | null) => void;
  titre?:    string;
}) {
  const [saisie, setSaisie]   = useState('');
  const [terme, setTerme]     = useState('');   // saisie temporisée
  const [ouvert, setOuvert]   = useState(false);
  const cadre = useRef<HTMLDivElement>(null);
  const minuteur = useTimeout();

  const actif = terme.trim().length >= MINIMUM;
  const { data: page, isFetching } = useInscriptions({
    page: 1,
    annee_universitaire: annee || '__aucune__',
    search: actif ? terme.trim() : undefined,
    actif: true,
  });
  // La requête reste montée entre deux frappes : on ne montre ses résultats
  // que si le terme courant les a demandés.
  const resultats = actif ? (page?.results ?? []).slice(0, 8) : [];

  const changer = (valeur: string) => {
    setSaisie(valeur);
    setOuvert(true);
    minuteur.set(() => setTerme(valeur), 350);
  };

  // Un clic hors du champ referme la liste : sans cela, elle recouvre le
  // relevé qu'on vient d'ouvrir.
  useEffect(() => {
    const dehors = (e: MouseEvent) => {
      if (cadre.current && !cadre.current.contains(e.target as Node)) setOuvert(false);
    };
    document.addEventListener('mousedown', dehors);
    return () => document.removeEventListener('mousedown', dehors);
  }, []);

  const retenir = (i: Inscription) => {
    onChoisir(i);
    setSaisie(''); setTerme(''); setOuvert(false);
  };

  return (
    <div className="flex flex-col gap-1.5" ref={cadre}>
      {titre && (
        <label className="text-xs font-semibold text-iss-dark">{titre}</label>
      )}

      {choisi ? (
        <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl border bg-emerald-50"
             style={{ borderColor: 'rgba(0,102,51,0.30)' }}>
          <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
               style={{ background: 'rgba(0,102,51,0.12)' }}>
            <User size={13} style={{ color: '#006633' }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-iss-dark truncate">
              {choisi.etudiant_nom}
            </p>
            <p className="text-[11px] text-iss-gray">
              {choisi.etudiant_matricule} · {choisi.classe_nom}
            </p>
          </div>
          <button type="button" onClick={() => onChoisir(null)}
                  aria-label="Changer d'étudiant"
                  className="shrink-0 text-iss-gray hover:text-red-600 transition-colors">
            <X size={15} />
          </button>
        </div>
      ) : (
        <div className="relative">
          <Search size={15}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-iss-gray pointer-events-none" />
          <input
            type="text" value={saisie} onChange={e => changer(e.target.value)}
            onFocus={() => saisie.length >= MINIMUM && setOuvert(true)}
            onKeyDown={e => { if (e.key === 'Escape') setOuvert(false); }}
            placeholder="Nom ou matricule…"
            className="w-full h-11 pl-9 pr-9 rounded-xl border border-gray-200 text-sm bg-white focus:outline-none focus:border-[#006633] transition-all"
          />
          {isFetching && actif && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full animate-spin border-2"
                 style={{ borderColor: 'rgba(0,102,51,0.25)', borderTopColor: '#006633' }} />
          )}

          {ouvert && resultats.length > 0 && (
            <div className="absolute z-50 w-full top-full mt-1 bg-white rounded-xl border border-gray-200 shadow-lg overflow-hidden max-h-72 overflow-y-auto">
              {resultats.map(i => (
                <button key={i.id} type="button" onClick={() => retenir(i)}
                        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors">
                  <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                    <User size={13} className="text-iss-gray" />
                  </div>
                  <div className="flex-1 text-left min-w-0">
                    <p className="text-sm font-medium text-iss-dark truncate">
                      {i.etudiant_nom}
                    </p>
                    <p className="text-[11px] text-iss-gray">
                      {i.etudiant_matricule} · {i.classe_nom}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {ouvert && actif && !isFetching && resultats.length === 0 && (
            <div className="absolute z-50 w-full top-full mt-1 bg-white rounded-xl border border-gray-200 shadow-lg p-4 text-center">
              <p className="text-sm text-iss-gray">
                Aucun inscrit en {annee} pour «&nbsp;{terme.trim()}&nbsp;».
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
