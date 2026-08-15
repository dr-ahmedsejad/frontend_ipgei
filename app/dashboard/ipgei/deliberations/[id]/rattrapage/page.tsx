'use client';

import { use, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2, Loader2, Repeat, Save } from 'lucide-react';

import {
  BTN_PRIMAIRE, Badge, CARTE, Chargement, DEGRADE, EnTetePage,
  Erreur, INPUT, Toast, Vide, fmtNote, tonDecision,
} from '../../../_ui';
import {
  useDeliberation, useGrilleRattrapage, useSaisieRattrapage,
} from '@/lib/api/ipgei-hooks';
import type { MatiereRattrapage, SaisieRattrapage } from '@/lib/api/ipgei';
import { DECISIONS_PAR_NIVEAU } from '@/types/ipgei';

/**
 * Saisie des notes de rattrapage, sur le jury qui désigne les concernés.
 *
 * TOUTES les matières de l'année y figurent, et non les seules matières
 * échouées : c'est le jury qui décide où l'on repasse. La règle est
 * `max(session normale, rattrapage)` — repasser une matière sans l'améliorer
 * ne fait aucun mal, mais une matière absente de la grille aurait interdit de
 * la repasser.
 *
 * Chaque case rappelle la moyenne de la session normale : on ne saisit pas un
 * rattrapage sans savoir ce qu'il doit dépasser.
 */
/**
 * Le bloc figé à gauche : qui, et sur quoi il doit faire mieux.
 *
 * La moyenne de la session normale est la seule référence utile quand on saisit
 * un rattrapage — la laisser défiler avec les quatorze colonnes de matières
 * obligeait à revenir en arrière pour savoir ce qu'on cherchait à dépasser.
 *
 * L'ancrage se calcule : la seconde colonne colle à `left` = largeur de la
 * première. Les deux largeurs sont donc fixes, et le nom passe à la ligne
 * plutôt que d'élargir la colonne et de décaler l'ancrage.
 *
 * Le liseré vient d'un `box-shadow` et non d'une bordure : sur un tableau en
 * `border-collapse`, les bordures d'une cellule collante ne se peignent pas.
 */
const LARGEUR_ETUDIANT = 232;

const COLONNE_ETUDIANT = {
  width: LARGEUR_ETUDIANT, minWidth: LARGEUR_ETUDIANT, maxWidth: LARGEUR_ETUDIANT,
} as const;

const COLONNE_MOYENNE = {
  left: LARGEUR_ETUDIANT, width: 96, minWidth: 96,
  boxShadow: '1px 0 0 #e5e7eb',
} as const;

/**
 * Une note telle qu'on la tape, rendue telle que l'API l'attend.
 *
 * On saisit « 12,5 » sur un clavier français, et le serveur veut « 12.5 » : le
 * lot entier partait alors en erreur, sans dire laquelle des quatorze cases
 * était fautive. La virgule se traduit donc ici, une fois, au départ.
 */
function normaliser(valeur: string): string {
  return valeur.trim().replace(',', '.');
}

/** Une case vide efface le rattrapage ; sinon, c'est une note sur 20. */
function estUneNote(valeur: string): boolean {
  const propre = normaliser(valeur);
  if (!propre) return true;
  const nombre = Number(propre);
  return Number.isFinite(nombre) && nombre >= 0 && nombre <= 20;
}

export default function SaisieRattrapagePage({ params }: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const deliberationId = Number(id);

  const { data: deliberation } = useDeliberation(deliberationId);
  const { data: grille, isLoading } = useGrilleRattrapage(deliberationId);
  const enregistrer = useSaisieRattrapage(deliberationId);

  /** Les cases modifiées, tant qu'elles ne sont pas envoyées. */
  const [brouillon, setBrouillon] = useState<Record<string, string>>({});
  const [toast, setToast]   = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  /** Au moins un envoi réussi : la saisie a produit quelque chose à valider. */
  const [enregistre, setEnregistre] = useState(false);

  const decisions = deliberation?.decisions_niveau
    ?? DECISIONS_PAR_NIVEAU[deliberation?.niveau ?? ''] ?? [];
  const libelle = (code: string) =>
    decisions.find(d => d.value === code)?.label ?? '';

  // Les matières se lisent par semestre : quatorze colonnes d'affilée ne
  // disent pas laquelle relève de S3 et laquelle de S4.
  const parSemestre = useMemo(() => {
    const groupes = new Map<string, MatiereRattrapage[]>();
    for (const matiere of grille?.matieres ?? []) {
      const liste = groupes.get(matiere.semestre) ?? [];
      liste.push(matiere);
      groupes.set(matiere.semestre, liste);
    }
    return [...groupes.entries()];
  }, [grille]);

  const cle = (inscription: number, matiere: number) => `${inscription}:${matiere}`;

  const valeurAffichee = (inscription: number, matiere: number,
                          enregistree: string | null) => {
    const modifiee = brouillon[cle(inscription, matiere)];
    return modifiee !== undefined ? modifiee : (enregistree ?? '');
  };

  const saisies: SaisieRattrapage[] = useMemo(
    () => Object.entries(brouillon).map(([reference, valeur]) => {
      const [inscription, matiere] = reference.split(':').map(Number);
      // Une case vidée EFFACE le rattrapage : l'étudiant retombe sur sa
      // moyenne de session normale, ce qui est le sens de « absent ».
      return {
        inscription, matiere,
        note_rattrapage: normaliser(valeur) || null,
      };
    }),
    [brouillon],
  );

  // Ce que la saisie contient d'invalide, dit AVANT l'envoi : le serveur
  // refuserait le lot entier, sans qu'on sache laquelle des quatorze cases est
  // en cause.
  const fautives = useMemo(
    () => Object.entries(brouillon)
      .filter(([, valeur]) => !estUneNote(valeur))
      .map(([reference]) => reference),
    [brouillon],
  );

  const envoyer = () => {
    if (!saisies.length) return;
    if (fautives.length) {
      setErreur(`${fautives.length} case(s) ne contiennent pas une note sur 20 `
                + '— corrigez-les avant d’enregistrer.');
      return;
    }
    setErreur(null);
    enregistrer.mutate(saisies, {
      onSuccess: (r) => {
        setBrouillon({});
        setEnregistre(true);
        setToast(`${r.saisies} note(s) enregistrée(s) — jury recalculé`);
        setTimeout(() => setToast(null), 3200);
      },
      onError: (e) => setErreur(e instanceof Error ? e.message : 'Erreur'),
    });
  };

  if (isLoading || !grille || !deliberation) return <Chargement />;

  const close = deliberation.est_verrouillee;

  return (
    <div className="space-y-5">
      <Link href={`/dashboard/ipgei/deliberations/${deliberationId}`}
            className="inline-flex items-center gap-1.5 text-sm text-iss-gray hover:text-[#006633] transition-colors">
        <ArrowLeft size={14} /> Jury de rattrapage
      </Link>

      <EnTetePage
        icone={<Repeat size={14} className="text-white" />}
        titre="Saisie du rattrapage"
        sousTitre={`${deliberation.classe_nom || deliberation.niveau} · `
          + `${deliberation.annee_universitaire} · ${grille.lignes.length} étudiant(s)`}
        actions={!close && (
          <button onClick={envoyer}
                  disabled={!saisies.length || enregistrer.isPending}
                  className={BTN_PRIMAIRE} style={{ background: DEGRADE }}>
            {enregistrer.isPending
              ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {enregistrer.isPending ? 'Enregistrement…'
              : saisies.length ? `Enregistrer (${saisies.length})` : 'Enregistrer'}
          </button>
        )}
      />

      {close && (
        <div className={`${CARTE} px-4 py-3 text-xs text-iss-gray`}
             style={{ borderLeft: '3px solid #006633' }}>
          Jury validé — la saisie est close. Dévalidez-le pour y revenir.
        </div>
      )}

      {/* La boucle ne se refermait pas : on saisissait, le jury se recalculait
          en silence, et il fallait se souvenir de revenir le valider. On le
          dit, et on y ramène. */}
      {enregistre && !close && (
        <div className={`${CARTE} px-4 py-3 flex items-center gap-3 flex-wrap`}
             style={{ borderLeft: '3px solid #006633' }}>
          <CheckCircle2 size={15} className="text-[#006633] shrink-0" />
          <p className="text-xs text-iss-gray flex-1 min-w-[240px]">
            Notes enregistrées, jury recalculé. Il reste à le{' '}
            <b className="text-iss-dark">valider</b> pour arrêter les décisions
            de la seconde session.
          </p>
          <Link href={`/dashboard/ipgei/deliberations/${deliberationId}`}
                className={BTN_PRIMAIRE} style={{ background: DEGRADE }}>
            <ArrowLeft size={14} /> Revenir au jury
          </Link>
        </div>
      )}

      {erreur && <Erreur erreur={new Error(erreur)} />}

      {!grille.lignes.length ? (
        <Vide texte="Aucun étudiant dans ce jury de rattrapage." />
      ) : (
        <div className={`${CARTE} overflow-x-auto`}>
          <table className="text-sm border-collapse">
            <thead>
              <tr className="text-xs font-semibold text-iss-gray uppercase tracking-wide border-b border-gray-100">
                <th className="px-4 py-3 text-left sticky left-0 bg-white z-10"
                    style={COLONNE_ETUDIANT}>
                  Étudiant
                </th>
                <th className="px-3 py-3 text-center sticky bg-white z-10"
                    style={COLONNE_MOYENNE}>
                  Moyenne
                </th>
                {parSemestre.map(([semestre, matieres]) => (
                  <th key={semestre} colSpan={matieres.length}
                      className="px-3 py-2 text-center border-l border-gray-100"
                      style={{ background: 'rgba(0,102,51,0.04)' }}>
                    {semestre}
                  </th>
                ))}
              </tr>
              <tr className="text-[11px] text-iss-gray border-b border-gray-100">
                <th className="sticky left-0 bg-white z-10" style={COLONNE_ETUDIANT} />
                <th className="px-3 py-2 text-center font-normal sticky bg-white z-10"
                    style={COLONNE_MOYENNE}>
                  session normale
                </th>
                {parSemestre.flatMap(([, matieres]) =>
                  matieres.map((matiere, rang) => (
                    <th key={matiere.id}
                        title={`${matiere.intitule} · coef. ${matiere.coefficient}`}
                        className={`px-2 py-2 text-center font-semibold text-iss-dark
                                    min-w-[86px] ${rang === 0 ? 'border-l border-gray-100' : ''}`}>
                      {matiere.code}
                    </th>
                  )))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {grille.lignes.map(ligne => (
                <tr key={ligne.inscription} className="hover:bg-gray-50/60">
                  <td className="px-4 py-2 sticky left-0 bg-white z-10"
                      style={COLONNE_ETUDIANT}>
                    {/* Largeur fixe et nom sur deux lignes s'il le faut : c'est
                        elle qui donne son point d'ancrage à la colonne suivante,
                        et un nom qui déborderait la décalerait d'autant. */}
                    <div className="font-semibold text-iss-dark leading-tight">
                      {ligne.etudiant_nom}
                    </div>
                    <div className="text-xs text-iss-gray flex items-center gap-2">
                      {ligne.etudiant_matricule}
                      {ligne.decision_auto && (
                        <Badge ton={tonDecision(ligne.decision_auto)}>
                          {libelle(ligne.decision_auto)}
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-center font-bold tabular-nums
                                 text-[#006633] sticky bg-white z-10"
                      style={COLONNE_MOYENNE}>
                    {fmtNote(ligne.moyenne_generale)}
                  </td>
                  {parSemestre.flatMap(([, matieres]) =>
                    matieres.map((matiere, rang) => {
                      const cellule = ligne.notes[String(matiere.id)];
                      const reference = cle(ligne.inscription, matiere.id);
                      const modifiee = brouillon[reference] !== undefined;
                      const fautive = fautives.includes(reference);
                      return (
                        <td key={matiere.id}
                            className={`px-2 py-2 align-top ${rang === 0 ? 'border-l border-gray-100' : ''}`}>
                          <input
                            value={valeurAffichee(ligne.inscription, matiere.id,
                                                  cellule?.rattrapage ?? null)}
                            inputMode="decimal"
                            disabled={close}
                            placeholder="—"
                            aria-invalid={fautive}
                            title={fautive
                              ? 'Une note sur 20 — la virgule est acceptée.'
                              : `Session normale : ${cellule?.moyenne ?? '—'}`}
                            onChange={e => setBrouillon(precedent => ({
                              ...precedent,
                              [reference]: e.target.value,
                            }))}
                            className={`${INPUT} text-center px-1 py-1.5`}
                            style={{
                              width: 74,
                              borderColor: fautive ? '#dc2626'
                                         : modifiee ? '#006633' : undefined,
                              background: modifiee ? '#fff' : undefined,
                            }}
                          />
                          {/* La note à dépasser, sous la case : c'est elle qui
                              est retenue si le rattrapage ne fait pas mieux. */}
                          <div className="text-[10px] text-iss-gray text-center mt-0.5 tabular-nums">
                            {cellule?.moyenne ? `sur ${fmtNote(cellule.moyenne)}` : 'non noté'}
                          </div>
                        </td>
                      );
                    }))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-iss-gray">
        La note retenue est le <b>maximum</b> entre la session normale et le
        rattrapage — repasser une matière ne peut jamais faire baisser une
        moyenne. Vider une case efface le rattrapage. Le jury est recalculé à
        chaque enregistrement, et ses décisions avec lui.
      </p>

      <Toast message={toast} />
    </div>
  );
}
