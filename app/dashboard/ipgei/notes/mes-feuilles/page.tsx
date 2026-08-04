'use client';

import Link from 'next/link';
import { BookOpenCheck, ChevronRight, Users } from 'lucide-react';

import {
  Badge, CARTE, Chargement, EnTetePage, Erreur, SELECT, Vide,
} from '../../_ui';
import { useAnneeIPGEI } from '../../_annee';
import { useMesFeuilles } from '@/lib/api/ipgei-hooks';

/**
 * Feuilles de notes de l'enseignant connecté.
 *
 * Le périmètre vient de l'emploi du temps : les couples classe × matière où
 * l'enseignant a des séances. IPGEI n'a pas de table d'affectation, et la
 * planification est de toute façon le seul endroit où l'information est tenue
 * à jour. Un compte de scolarité n'a pas de feuille — il passe par la grille
 * complète, qui couvre toutes les classes.
 */
export default function MesFeuillesPage() {
  const { annee, setAnnee, options } = useAnneeIPGEI();
  const { data: feuilles = [], isLoading, error } = useMesFeuilles(annee);

  // Une même matière peut être enseignée dans plusieurs classes : le regroupement
  // par semestre garde la liste lisible quand un enseignant en a une dizaine.
  const parSemestre = feuilles.reduce<Record<string, typeof feuilles>>((acc, feuille) => {
    (acc[feuille.semestre_code] ??= []).push(feuille);
    return acc;
  }, {});

  return (
    <div className="space-y-5">
      <EnTetePage
        icone={<BookOpenCheck size={14} className="text-white" />}
        titre="Mes feuilles de notes"
        sousTitre="Les matières que vous enseignez, telles que l'emploi du temps les enregistre."
        actions={
          <select value={annee} onChange={e => setAnnee(e.target.value)}
                  className={SELECT} style={{ maxWidth: 180 }}>
            {options.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        }
      />

      <Erreur erreur={error} />

      {isLoading && !feuilles.length ? (
        <div className={CARTE}><Chargement texte="Lecture de votre emploi du temps…" /></div>
      ) : !feuilles.length ? (
        <div className={CARTE}>
          <Vide texte={
            'Aucune matière ne vous est rattachée sur cette année. Les feuilles '
            + "apparaissent dès qu'une séance vous est affectée dans l'emploi du temps."
          } />
        </div>
      ) : (
        Object.entries(parSemestre).map(([code, lot]) => (
          <div key={code} className="space-y-2">
            <h2 className="text-xs font-bold text-iss-gray uppercase tracking-wide">
              Semestre {code}
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {lot.map(feuille => (
                <Link
                  key={`${feuille.classe}-${feuille.matiere}`}
                  // L'année voyage avec le reste : sans elle, la grille
                  // s'ouvrirait sur l'année courante et n'y trouverait ni la
                  // classe ni la matière demandées.
                  href={'/dashboard/ipgei/notes'
                    + `?classe=${feuille.classe}&matiere=${feuille.matiere}`
                    + `&semestre=${feuille.semestre}&annee=${feuille.annee_universitaire}`}
                  className={`${CARTE} p-4 flex items-start gap-3 hover:border-[#006633]/40 transition-colors`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-iss-dark truncate">
                      {feuille.matiere_code} — {feuille.matiere_intitule}
                    </p>
                    <p className="text-xs text-iss-gray flex items-center gap-1.5 mt-1">
                      <Users size={12} /> {feuille.classe_nom}
                    </p>
                    <Badge ton="neutre">
                      {feuille.seances} séance{feuille.seances > 1 ? 's' : ''} planifiée
                      {feuille.seances > 1 ? 's' : ''}
                    </Badge>
                  </div>
                  <ChevronRight size={16} className="text-iss-gray shrink-0 mt-1" />
                </Link>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
