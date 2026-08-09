'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, FileSearch, Printer } from 'lucide-react';

import {
  Badge, CARTE, Chargement, EnTetePage, Erreur, SELECT, Tuile, fmtCoef, fmtNote,
} from '../../_ui';
import { useAnneeIPGEI } from '../../_annee';
import ChoixInscription from '../_choix-inscription';
import { useReleveAnnuel } from '@/lib/api/ipgei-hooks';
import type { Inscription, Note } from '@/types/ipgei';

/**
 * Consultation des notes — à l'écran, sans rien émettre.
 *
 * Contrôler la moyenne d'un étudiant ne devrait pas obliger à délivrer une
 * pièce : chaque relevé édité prend un numéro de série au registre et existe
 * dès lors dans la nature. Un agent qui vérifie dix dossiers en émettait dix.
 * Ici on lit, on n'émet pas.
 *
 * Repris du dispositif SIGA (Documents → Consultation des relevés), transposé
 * aux objets IPGEI : matières et classe, là où SIGA groupe par module et EM.
 */

/** Deux semestres par année d'étude : la moyenne annuelle est leur synthèse. */
function TableauSemestre({ code, moyenne, notes }: {
  code: string; moyenne: string | null; notes: Note[];
}) {
  const aDesTP = notes.some(n => n.matiere_has_tp);
  const aDuRattrapage = notes.some(n => n.note_rattrapage !== null);

  return (
    <div className={`${CARTE} overflow-hidden`}>
      <div className="px-4 py-3 flex items-center justify-between gap-3 border-b border-gray-100">
        <h3 className="text-sm font-bold text-iss-dark">Semestre {code}</h3>
        <span className="text-sm text-iss-dark">
          Moyenne <b className="tabular-nums">{fmtNote(moyenne)}</b> / 20
        </span>
      </div>

      {notes.length === 0 ? (
        <p className="px-4 py-6 text-sm text-iss-gray">Aucune note saisie sur ce semestre.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold text-iss-gray border-b border-gray-100">
                <th className="px-4 py-2.5">Matière</th>
                <th className="px-3 py-2.5 text-center">Coef.</th>
                <th className="px-3 py-2.5 text-center">DS</th>
                {aDesTP && <th className="px-3 py-2.5 text-center">TP</th>}
                <th className="px-3 py-2.5 text-center">Examen</th>
                {aDuRattrapage && <th className="px-3 py-2.5 text-center">Ratt.</th>}
                <th className="px-4 py-2.5 text-center">Moyenne</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {notes.map(n => {
                // La note RETENUE peut différer de la moyenne calculée : après
                // rattrapage, c'est elle qui compte. Marquer l'écart évite de
                // lire une moyenne sans comprendre d'où elle vient.
                const retenue = n.note_retenue ?? n.moyenne;
                const rattrape = n.note_rattrapage !== null;
                return (
                  <tr key={n.id} className="hover:bg-gray-50/60">
                    <td className="px-4 py-2.5 text-iss-dark">
                      {n.matiere_intitule}
                      {!n.matiere_has_tp && (
                        <span className="text-iss-gray text-xs"> · sans TP</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-center text-iss-gray tabular-nums">
                      {fmtCoef(n.coefficient ?? n.matiere_coefficient)}
                    </td>
                    <td className="px-3 py-2.5 text-center tabular-nums">{fmtNote(n.moy_ds)}</td>
                    {aDesTP && (
                      <td className="px-3 py-2.5 text-center tabular-nums">{fmtNote(n.note_tp)}</td>
                    )}
                    <td className="px-3 py-2.5 text-center tabular-nums">{fmtNote(n.moy_exam)}</td>
                    {aDuRattrapage && (
                      <td className="px-3 py-2.5 text-center tabular-nums">
                        {fmtNote(n.note_rattrapage)}
                      </td>
                    )}
                    <td className="px-4 py-2.5 text-center font-semibold tabular-nums text-iss-dark">
                      {fmtNote(retenue)}
                      {rattrape && (
                        <span className="ml-1.5 text-[10px] font-normal text-amber-700">
                          après ratt.
                        </span>
                      )}
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
}

export default function ConsultationNotesPage() {
  const { annee, setAnnee, options } = useAnneeIPGEI();
  const [inscription, setInscription] = useState<Inscription | null>(null);

  const { data: releve, isLoading, error } = useReleveAnnuel(inscription?.id ?? null);

  return (
    <div className="space-y-5 max-w-5xl">
      <Link href="/dashboard/ipgei/documents"
            className="inline-flex items-center gap-1.5 text-sm text-iss-gray hover:text-[#006633] transition-colors">
        <ArrowLeft size={14} /> Documents officiels
      </Link>

      <EnTetePage
        icone={<FileSearch size={14} className="text-white" />}
        titre="Consultation des notes"
        sousTitre="Les deux semestres à l'écran — rien n'est émis, rien n'est numéroté."
        actions={
          <select value={annee}
                  onChange={e => { setAnnee(e.target.value); setInscription(null); }}
                  className={SELECT} style={{ width: 140 }}>
            {options.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        }
      />

      <div className={`${CARTE} p-6`}>
        <ChoixInscription annee={annee} choisi={inscription} onChoisir={setInscription} />
      </div>

      {inscription && (
        <>
          <Erreur erreur={error} />

          {isLoading ? <Chargement texte="Lecture du relevé…" /> : releve && (
            <>
              <div className={`${CARTE} p-4 flex flex-wrap items-center gap-x-4 gap-y-2`}>
                <span className="font-semibold text-iss-dark">{releve.etudiant.nom}</span>
                <span className="font-mono text-xs text-iss-gray">
                  {releve.etudiant.matricule}
                </span>
                <span className="text-sm text-iss-gray">
                  {releve.classe} · {releve.annee_universitaire}
                </span>
                <span className="ml-auto">
                  <Badge ton={releve.valide ? 'vert' : 'ambre'}>
                    {releve.valide ? 'Année validée' : 'Sous le seuil'}
                  </Badge>
                </span>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <Tuile label="Moyenne annuelle" valeur={fmtNote(releve.moyenne)}
                       detail={`Seuil de validation ${fmtNote(releve.seuil)} / 20`} />
                <Tuile label="Total des coefficients"
                       valeur={fmtCoef(releve.total_coefficients)}
                       detail="Somme sur les deux semestres" />
                <Tuile label="Absences" valeur={releve.absences.total}
                       detail={`${releve.absences.justifiees} justifiée`
                               + `${releve.absences.justifiees > 1 ? 's' : ''}, `
                               + `${releve.absences.retards} retard`
                               + `${releve.absences.retards > 1 ? 's' : ''}`} />
              </div>

              {releve.semestres.map(s => (
                <TableauSemestre key={s.code} code={s.code} moyenne={s.moyenne}
                                 notes={s.notes} />
              ))}

              {/* La consultation ne délivre rien : quand une pièce est
                  réellement demandée, on passe par l'émission, qui la numérote
                  et la scelle. */}
              <p className="text-xs text-iss-gray">
                Pour délivrer un relevé signé et vérifiable,{' '}
                <Link href="/dashboard/ipgei/documents/generer"
                      className="text-[#006633] font-medium hover:underline inline-flex items-center gap-1">
                  <Printer size={12} /> émettez le document
                </Link>{' '}
                — il recevra alors son numéro au registre.
              </p>
            </>
          )}
        </>
      )}
    </div>
  );
}
