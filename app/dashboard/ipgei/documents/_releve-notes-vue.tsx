'use client';

import { Badge } from '../_ui';
import type { ReleveAnnuel } from '@/types/ipgei';

/**
 * Relevé consolidé à l'écran, dans le gabarit du relevé SIGA.
 *
 * Groupé par année universitaire → semestre → matière : un bloc gris par
 * semestre, sa moyenne et son verdict dans la barre de titre, puis une ligne
 * par matière avec DS / TP / Examen / Rattrapage / Moyenne / Statut. Lecture
 * seule.
 *
 * La hiérarchie de SIGA compte un niveau de plus — module, puis élément de
 * module. L'IPGEI n'en a pas : une matière est directement rattachée au
 * semestre. La colonne « Module » cède donc la place au coefficient, qui est
 * ce qu'on cherche à côté d'une note quand on vérifie une moyenne.
 */
export default function ReleveNotesVue({ releve, seuil }: {
  releve: ReleveAnnuel;
  /** Seuil de validation, pour juger chaque matière comme le fait le jury. */
  seuil:  string;
}) {
  const barre = Number(seuil);
  const fmt = (v: string | null | undefined) =>
    (v === null || v === undefined ? '—' : Number(v).toFixed(2));

  const vide = releve.semestres.every(s => s.notes.length === 0);
  if (vide) {
    return (
      <p className="text-sm text-iss-gray text-center py-8">
        Aucune note enregistrée pour cet étudiant.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-bold text-iss-dark mb-3 pb-2 border-b border-gray-100">
          Année universitaire{' '}
          <span style={{ color: '#006633' }}>{releve.annee_universitaire}</span>
          <span className="font-normal text-iss-gray"> · {releve.classe}</span>
        </h3>

        {releve.semestres.map(sem => {
          const aDesTP = sem.notes.some(n => n.matiere_has_tp);
          const moyenne = sem.moyenne === null ? null : Number(sem.moyenne);
          const total = sem.notes.reduce(
            (t, n) => t + Number(n.coefficient ?? n.matiere_coefficient ?? 0), 0);

          return (
            <div key={sem.code}
                 className="mb-5 bg-gray-50/50 rounded-xl border border-gray-100 overflow-hidden">
              <div className="px-4 py-2.5 bg-gray-100/60 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
                <div className="text-sm font-semibold text-iss-dark">
                  Semestre {sem.code}
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-iss-gray">Moyenne</span>
                  <span className="font-bold text-iss-dark tabular-nums">
                    {fmt(sem.moyenne)}/20
                  </span>
                  <span className="text-iss-gray">·</span>
                  <span className="text-iss-gray">Coefficients</span>
                  <span className="font-bold text-iss-dark tabular-nums">{total}</span>
                  {moyenne !== null && (
                    <Badge ton={moyenne >= barre ? 'vert' : 'rouge'}>
                      {moyenne >= barre ? 'Acquis' : 'Sous le seuil'}
                    </Badge>
                  )}
                </div>
              </div>

              {sem.notes.length === 0 ? (
                <p className="px-4 py-5 text-xs text-iss-gray">
                  Aucune note saisie sur ce semestre.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-white text-[10px] uppercase text-iss-gray">
                      <tr>
                        <th className="text-left   p-2 border-b">Matière</th>
                        <th className="text-center p-2 border-b">Coef.</th>
                        <th className="text-center p-2 border-b">DS</th>
                        {aDesTP && <th className="text-center p-2 border-b">TP</th>}
                        <th className="text-center p-2 border-b">Examen</th>
                        <th className="text-center p-2 border-b">Rattrapage</th>
                        <th className="text-center p-2 border-b">Moyenne</th>
                        <th className="text-center p-2 border-b">Statut</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sem.notes.map(n => {
                        // La note RETENUE prime sur la moyenne calculée : après
                        // rattrapage, c'est elle qui compte pour le jury.
                        const retenue = n.note_retenue ?? n.moyenne;
                        const valeur = retenue === null ? null : Number(retenue);
                        return (
                          <tr key={n.id} className="border-b border-gray-50">
                            <td className="p-2">
                              <div className="font-medium font-mono">{n.matiere_code}</div>
                              <div className="text-[10px] text-iss-gray">
                                {n.matiere_intitule}
                              </div>
                            </td>
                            <td className="p-2 text-center font-mono">
                              {fmt(n.coefficient ?? n.matiere_coefficient)}
                            </td>
                            <td className="p-2 text-center font-mono">{fmt(n.moy_ds)}</td>
                            {aDesTP && (
                              <td className="p-2 text-center font-mono">
                                {n.matiere_has_tp
                                  ? fmt(n.note_tp)
                                  : <span className="text-iss-gray/30">—</span>}
                              </td>
                            )}
                            <td className="p-2 text-center font-mono">{fmt(n.moy_exam)}</td>
                            <td className="p-2 text-center font-mono">
                              {fmt(n.note_rattrapage)}
                            </td>
                            <td className="p-2 text-center font-mono font-bold">
                              {fmt(retenue)}
                            </td>
                            <td className="p-2 text-center">
                              {/* Des mots, pas des codes : « V » et « NV »
                                  demandent une légende, et l'IPGEI écrit
                                  partout ailleurs « Validée », « Admis »,
                                  « Redoublant ». */}
                              {valeur === null
                                ? <span className="text-iss-gray/40">—</span>
                                : valeur >= barre
                                  ? <Badge ton="vert">Acquise</Badge>
                                  : <Badge ton="ambre">Sous le seuil</Badge>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
