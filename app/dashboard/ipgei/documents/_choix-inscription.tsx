'use client';

import { useState } from 'react';
import { Search } from 'lucide-react';

import { Chargement, SELECT } from '../_ui';
import { useClassesSelect, useInscriptions } from '@/lib/api/ipgei-hooks';
import type { Inscription } from '@/types/ipgei';

/**
 * Choix d'un inscrit — filtre par classe, recherche par nom ou matricule.
 *
 * Partagé par l'émission d'un document et la consultation des notes : les deux
 * commencent par désigner le même étudiant, et deux listes séparées auraient
 * fini par ne plus filtrer de la même façon.
 *
 * Le composant ne porte AUCUN bouton de navigation : l'assistant d'émission a
 * ses étapes, la consultation n'en a pas. C'est à l'appelant de placer ce qui
 * suit.
 */
export default function ChoixInscription({
  annee, choisi, onChoisir, titre = "Sélectionner l'étudiant",
}: {
  annee:     string;
  choisi:    Inscription | null;
  onChoisir: (i: Inscription) => void;
  titre?:    string;
}) {
  const [classe, setClasse]       = useState('');
  const [recherche, setRecherche] = useState('');

  const { data: classes = [] } = useClassesSelect({
    annee_universitaire: annee, actif: true,
  });
  const { data: page, isLoading } = useInscriptions({
    page: 1,
    // `__aucune__` plutôt qu'un filtre absent : sans année, la requête
    // rendrait toutes les promotions confondues.
    annee_universitaire: annee || '__aucune__',
    classe: classe ? Number(classe) : undefined,
    search: recherche || undefined,
    actif: true,
  });
  const inscriptions = page?.results ?? [];

  return (
    <div className="space-y-4">
      {titre && <h2 className="font-semibold text-iss-dark">{titre}</h2>}

      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="block text-xs font-semibold text-iss-dark mb-1.5">Classe</label>
          <select value={classe} className={SELECT} onChange={e => setClasse(e.target.value)}>
            <option value="">Toutes</option>
            {classes.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-semibold text-iss-dark mb-1.5">Rechercher</label>
          <div className="relative">
            <Search size={14}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-iss-gray pointer-events-none" />
            <input value={recherche} onChange={e => setRecherche(e.target.value)}
                   placeholder="Nom ou matricule…"
                   className="w-full h-11 pl-9 pr-4 rounded-xl border border-gray-200 text-sm bg-white focus:outline-none focus:border-[#006633] transition-all" />
          </div>
        </div>
      </div>

      {isLoading ? <Chargement /> : (
        <div className="max-h-64 overflow-y-auto rounded-xl border border-gray-200 divide-y divide-gray-100">
          {inscriptions.length === 0 ? (
            <p className="px-4 py-5 text-sm text-iss-gray">Aucune inscription pour ces critères.</p>
          ) : inscriptions.map(i => (
            <button key={i.id} type="button" onClick={() => onChoisir(i)}
                    className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                      choisi?.id === i.id
                        ? 'bg-[#006633]/8 font-semibold text-[#006633]'
                        : 'hover:bg-gray-50'}`}>
              {i.etudiant_nom}
              <span className="text-iss-gray"> · {i.etudiant_matricule} · {i.classe_nom}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
