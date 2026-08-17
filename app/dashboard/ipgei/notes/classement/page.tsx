'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, FileSpreadsheet, FileText, Loader2, Trophy,
} from 'lucide-react';

import { downloadBlob } from '@/lib/downloadBlob';
import {
  BTN_PRIMAIRE, BTN_SECONDAIRE, CARTE, Chargement, DEGRADE, EnTetePage, Erreur,
  SELECT, Vide, fmtNote,
} from '../../_ui';
import { useAnneeIPGEI } from '../../_annee';
import {
  useClassementMutations, useClassementS3, useNiveauxCursus,
} from '@/lib/api/ipgei-hooks';

/**
 * Classement de S3 — la feuille de travail de la séance d'affectation.
 *
 * Deux chiffres sur lesquels trancher — la moyenne de première année, qui dit
 * le fond, et celle de S3, qui dit où en est l'étudiant — puis deux colonnes
 * VIDES : décision et affectation, remplies à la main en séance.
 *
 * Ce n'est pas un procès-verbal : rien n'y est prononcé, aucun numéro de
 * registre, et il se réédite à volonté dès qu'une note bouge.
 */
export default function ClassementS3Page() {
  const { annee, setAnnee, options } = useAnneeIPGEI();
  const [niveau, setNiveau] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);

  // Seuls les niveaux de DEUXIÈME année : S3 est leur semestre. Proposer MPSI
  // menait à une liste vide sans qu'on comprenne pourquoi — l'écran offrait un
  // choix qui ne pouvait rien donner.
  const { data: tousNiveaux = [] } = useNiveauxCursus(true);
  const niveaux = useMemo(
    () => tousNiveaux.filter(n => n.rang === 2)
      .map(n => ({ value: n.code, label: n.libelle || `${n.code} — ${n.libelle_rang}` })),
    [tousNiveaux],
  );

  const { data: lignes = [], isLoading } = useClassementS3(annee, niveau || undefined);
  const { exporter } = useClassementMutations();

  // QUEL format est en cours : les deux boutons partagent la même mutation, et
  // sans cette distinction cliquer sur l'un ferait tourner l'autre.
  const enCours = (format: 'pdf' | 'excel') =>
    exporter.isPending && exporter.variables?.sortie === format;

  const editer = (sortie: 'pdf' | 'excel') => {
    setErreur(null);
    exporter.mutate({ annee, sortie, niveau: niveau || undefined }, {
      onSuccess: (blob) => downloadBlob(
        blob, `classement_S3_${niveau || '2e-annee'}_${annee}.`
              + (sortie === 'excel' ? 'xlsx' : 'pdf')),
      onError: (e) => setErreur(e instanceof Error ? e.message : 'Erreur'),
    });
  };

  return (
    <div className="space-y-5 max-w-4xl">
      <Link href="/dashboard/ipgei/notes"
            className="inline-flex items-center gap-1.5 text-sm text-iss-gray hover:text-[#006633] transition-colors">
        <ArrowLeft size={14} /> Saisie des notes
      </Link>

      <EnTetePage
        icone={<Trophy size={14} className="text-white" />}
        titre="Classement S3"
        sousTitre="Moyenne de première année et moyenne de S3 — décision et affectation à compléter en séance."
        actions={
          <select value={annee} className={SELECT} style={{ width: 140 }}
                  onChange={e => setAnnee(e.target.value)}>
            {options.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        }
      />

      <div className={`${CARTE} p-6 space-y-4`}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-semibold text-iss-dark mb-1.5">
              Niveau
            </label>
            {/* Seuls les niveaux de DEUXIÈME année : S3 est leur semestre.
                Proposer MPSI menait à une liste vide sans qu'on comprenne
                pourquoi. Le classement porte sur la promotion entière — il
                n'est pas découpé par classe, c'est l'ordre du niveau qui
                fonde l'affectation. */}
            <select value={niveau} className={SELECT}
                    onChange={e => setNiveau(e.target.value)}>
              <option value="">Tous les niveaux de 2e année</option>
              {niveaux.map(n => (
                <option key={n.value} value={n.value}>{n.label}</option>
              ))}
            </select>
          </div>
        </div>

        {erreur && <Erreur erreur={new Error(erreur)} />}

        <div className="flex gap-2 flex-wrap">
          <button onClick={() => editer('pdf')}
                  disabled={!lignes.length || enCours('pdf')}
                  className={BTN_PRIMAIRE} style={{ background: DEGRADE }}>
            {enCours('pdf')
              ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
            Classement PDF
          </button>
          <button onClick={() => editer('excel')}
                  disabled={!lignes.length || enCours('excel')}
                  className={BTN_SECONDAIRE}>
            {enCours('excel')
              ? <Loader2 size={14} className="animate-spin" />
              : <FileSpreadsheet size={14} />}
            Classement Excel
          </button>
        </div>

        <p className="text-xs text-iss-gray">
          Les colonnes <b>Décision</b> et <b>Affectation</b> sortent <b>vides</b> :
          elles se remplissent en séance. Le PDF les imprime larges, le classeur
          les laisse saisissables.
        </p>
      </div>

      {isLoading ? <Chargement /> : !lignes.length ? (
        <Vide texte={`Aucun étudiant de deuxième année en ${annee}. Le classement de S3 `
                     + `porte sur les inscrits de 2e année.`} />
      ) : (
        <div className={CARTE}>
          <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
            <h2 className="text-sm font-bold text-iss-dark">
              {lignes.length} étudiant{lignes.length > 1 ? 's' : ''} à classer
            </h2>
            <span className="text-xs text-iss-gray">· du meilleur S3 au moins bon</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold text-iss-gray uppercase tracking-wide border-b border-gray-100">
                  <th className="px-4 py-3 w-14 text-center">Rang</th>
                  <th className="px-4 py-3">Matricule</th>
                  <th className="px-4 py-3">Étudiant</th>
                  <th className="px-4 py-3 text-center">Moyenne 1re année</th>
                  <th className="px-4 py-3 text-center">Moyenne S3</th>
                  {/* Ce qui range la liste, posé après ses deux termes : on
                      vérifie la moyenne de classement d'un coup d'œil. */}
                  <th className="px-4 py-3 text-center"
                      title="(moyenne de 1re année + moyenne S3) / 2">
                    Moyenne de classement
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {lignes.map(ligne => (
                  <tr key={ligne.matricule} className="hover:bg-gray-50/60">
                    <td className="px-4 py-2.5 text-center font-bold text-iss-gray">
                      {ligne.rang ?? '—'}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs">{ligne.matricule}</td>
                    <td className="px-4 py-2.5">
                      <span className="text-iss-dark">{ligne.nom}</span>
                      <span className="text-xs text-iss-gray"> · {ligne.classe}</span>
                    </td>
                    {/* Un tiret, pas un zéro : l'établissement n'a pas cette
                        note — l'étudiant vient d'ailleurs, ou son année n'est
                        pas saisie. */}
                    <td className="px-4 py-2.5 text-center tabular-nums">
                      {fmtNote(ligne.moyenne_annee1)}
                      {ligne.annee1 && (
                        <span className="text-[11px] text-iss-gray"> ({ligne.annee1})</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-center tabular-nums">
                      {fmtNote(ligne.moyenne_s3)}
                    </td>
                    <td className="px-4 py-2.5 text-center tabular-nums font-bold text-[#006633]">
                      {fmtNote(ligne.moyenne_classement)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
