'use client';

import { useEffect, useMemo, useState } from 'react';
import { GraduationCap, Lock, Minus, Plus, RefreshCw, Save } from 'lucide-react';

import {
  BTN_PRIMAIRE, BTN_SECONDAIRE, Badge, CARTE, Chargement, DEGRADE, EnTetePage,
  Erreur, SELECT, Toast, Vide, fmtCoef, fmtNote,
} from '../_ui';
import { useAnneeIPGEI } from '../_annee';
import {
  useClassesSelect, useGrilleNotes, useMatieresSelect, useNoteMutations,
  useSemestresAll,
} from '@/lib/api/ipgei-hooks';
import type { Note, SaisieLigneNote, TypeEvaluation } from '@/types/ipgei';

/** Une cellule modifiée, pas encore envoyée. */
type Brouillon = Record<string, string>;

const cle = (noteId: number, champ: string) => `${noteId}:${champ}`;

export default function SaisieNotesPage() {
  const { annee, setAnnee, options } = useAnneeIPGEI();

  const [classeId, setClasseId]     = useState<number | null>(null);
  const [semestreId, setSemestreId] = useState<number | null>(null);
  const [matiereId, setMatiereId]   = useState<number | null>(null);

  const { data: classes = [] }   = useClassesSelect({ annee_universitaire: annee, actif: true });
  const { data: semestres = [] } = useSemestresAll({ annee_universitaire: annee });

  const classe   = classes.find(c => c.id === classeId);
  const semestre = semestres.find(s => s.id === semestreId);

  // Le niveau de la classe borne les semestres proposés : une MPSI ne délibère
  // pas sur S3/S4.
  const semestresDuNiveau = useMemo(
    () => (classe ? semestres.filter(s => s.niveau === classe.niveau) : semestres),
    [classe, semestres],
  );

  const { data: matieres = [] } = useMatieresSelect({
    code_semestre: semestre?.code, actif: true,
  });

  // Réinitialise les sélections devenues incohérentes après un changement amont.
  useEffect(() => {
    if (semestreId && !semestresDuNiveau.some(s => s.id === semestreId)) setSemestreId(null);
  }, [semestresDuNiveau, semestreId]);
  useEffect(() => {
    if (matiereId && !matieres.some(m => m.id === matiereId)) setMatiereId(null);
  }, [matieres, matiereId]);

  const { data: grille, isLoading, error } = useGrilleNotes(classeId, matiereId, semestreId);
  const { saisieCollective, recalculerLot } = useNoteMutations();

  const [brouillon, setBrouillon] = useState<Brouillon>({});
  const [colonnesDS, setColonnesDS]   = useState(1);
  const [colonnesExam, setColonnesExam] = useState(1);
  const [toast, setToast]         = useState<string | null>(null);
  const [erreurSauvegarde, setErreurSauvegarde] = useState<string | null>(null);

  const notifier = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2800); };

  // La grille arrive avec le nombre de colonnes déjà utilisées : on repart de là.
  useEffect(() => {
    if (!grille) return;
    setColonnesDS(grille.nb_ds);
    setColonnesExam(grille.nb_examens);
    setBrouillon({});
  }, [grille]);

  const verrouillee = grille?.verrouillee ?? false;
  const aDesTP      = grille?.matiere.has_tp ?? false;
  const modifie     = Object.keys(brouillon).length > 0;

  const valeurCellule = (note: Note, champ: string, valeurBase: string | null) => {
    const k = cle(note.id, champ);
    return k in brouillon ? brouillon[k] : (valeurBase ?? '');
  };

  const majCellule = (noteId: number, champ: string, valeur: string) =>
    setBrouillon(b => ({ ...b, [cle(noteId, champ)]: valeur }));

  const valeurEvaluation = (note: Note, type: TypeEvaluation, numero: number) =>
    note.evaluations.find(e => e.type_evaluation === type && e.numero === numero)?.valeur ?? null;

  const enregistrer = () => {
    if (!grille || !classeId || !matiereId || !semestreId) return;
    setErreurSauvegarde(null);

    // On n'envoie que les lignes réellement touchées : une grille de 40 élèves
    // ne doit pas déclencher 40 recalculs pour deux notes corrigées.
    const parNote = new Map<number, SaisieLigneNote>();
    for (const [k, valeur] of Object.entries(brouillon)) {
      const [idTexte, champ] = k.split(':');
      const note = grille.notes.find(n => n.id === Number(idTexte));
      if (!note) continue;

      const ligne = parNote.get(note.id) ?? { inscription: note.inscription, evaluations: [] };
      const propre = valeur.trim();

      if (champ === 'tp')            ligne.note_tp = propre === '' ? null : propre;
      else if (champ === 'rattrapage') ligne.note_rattrapage = propre === '' ? null : propre;
      else {
        const [type, numero] = champ.split('-');
        ligne.evaluations = [
          ...(ligne.evaluations ?? []),
          {
            type_evaluation: type as TypeEvaluation,
            numero: Number(numero),
            valeur: propre === '' ? null : propre,
          },
        ];
      }
      parNote.set(note.id, ligne);
    }

    saisieCollective.mutate(
      { classe: classeId, matiere: matiereId, semestre: semestreId, lignes: [...parNote.values()] },
      {
        onSuccess: (r) => { setBrouillon({}); notifier(`${r.lignes_traitees} ligne(s) enregistrée(s)`); },
        onError:   (e) => setErreurSauvegarde(e instanceof Error ? e.message : 'Erreur'),
      },
    );
  };

  const pret = classeId && semestreId && matiereId;

  return (
    <div className="space-y-5">
      <EnTetePage
        icone={<GraduationCap size={14} className="text-white" />}
        titre="Saisie des notes"
        sousTitre="Devoirs surveillés et examens en nombre libre ; la moyenne se recalcule à l'enregistrement."
        actions={
          <>
            {pret && (
              <button
                onClick={() => recalculerLot.mutate(
                  { semestre: semestreId!, classe: classeId! },
                  { onSuccess: (r) => notifier(`${r.notes_recalculees} note(s) recalculée(s)`) },
                )}
                disabled={recalculerLot.isPending || verrouillee}
                className={BTN_SECONDAIRE}>
                <RefreshCw size={14} className={recalculerLot.isPending ? 'animate-spin' : ''} />
                Recalculer la classe
              </button>
            )}
            <button onClick={enregistrer} disabled={!modifie || saisieCollective.isPending || verrouillee}
                    className={BTN_PRIMAIRE} style={{ background: DEGRADE }}>
              <Save size={14} /> Enregistrer{modifie ? ` (${Object.keys(brouillon).length})` : ''}
            </button>
          </>
        }
      />

      <div className={`${CARTE} p-4`}>
        <div className="grid gap-3 sm:grid-cols-4">
          <div>
            <label className="block text-xs font-semibold text-iss-dark mb-1.5">Année</label>
            <select value={annee} onChange={e => setAnnee(e.target.value)} className={SELECT}>
              {options.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-iss-dark mb-1.5">Classe</label>
            <select value={classeId ?? ''} className={SELECT}
                    onChange={e => setClasseId(e.target.value ? Number(e.target.value) : null)}>
              <option value="">Choisir…</option>
              {classes.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-iss-dark mb-1.5">Semestre</label>
            <select value={semestreId ?? ''} className={SELECT} disabled={!classeId}
                    onChange={e => setSemestreId(e.target.value ? Number(e.target.value) : null)}>
              <option value="">Choisir…</option>
              {semestresDuNiveau.map(s => (
                <option key={s.id} value={s.id}>{s.code}{s.est_cloture ? ' (clôturé)' : ''}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-iss-dark mb-1.5">Matière</label>
            <select value={matiereId ?? ''} className={SELECT} disabled={!semestreId}
                    onChange={e => setMatiereId(e.target.value ? Number(e.target.value) : null)}>
              <option value="">Choisir…</option>
              {matieres.map(m => <option key={m.id} value={m.id}>{m.code} — {m.intitule}</option>)}
            </select>
          </div>
        </div>
      </div>

      <Erreur erreur={error} />
      {erreurSauvegarde && <Erreur erreur={new Error(erreurSauvegarde)} />}

      {!pret ? (
        <div className={CARTE}>
          <Vide texte="Choisissez une classe, un semestre et une matière pour ouvrir la grille." />
        </div>
      ) : isLoading && !grille ? (
        <div className={CARTE}><Chargement texte="Ouverture de la grille…" /></div>
      ) : grille && (
        <>
          <div className={`${CARTE} px-4 py-3 flex items-center gap-3 flex-wrap`}
               style={{ borderLeft: '3px solid #006633' }}>
            <span className="text-sm font-bold text-iss-dark">
              {grille.matiere.code} — {grille.matiere.intitule}
            </span>
            <Badge ton="bleu">Coefficient {fmtCoef(grille.matiere.coefficient)}</Badge>
            <Badge ton="neutre">
              DS {fmtCoef(grille.matiere.pct_ds)}%
              {aDesTP && ` · TP ${fmtCoef(grille.matiere.pct_tp)}%`}
              {` · Exam ${fmtCoef(grille.matiere.pct_exam)}%`}
            </Badge>
            {verrouillee && (
              <Badge ton="ambre"><Lock size={10} className="inline mr-1" />Semestre clôturé — lecture seule</Badge>
            )}

            {!verrouillee && (
              <div className="ml-auto flex items-center gap-4">
                <CompteurColonnes label="DS" valeur={colonnesDS} min={grille.nb_ds} onChange={setColonnesDS} />
                <CompteurColonnes label="Examens" valeur={colonnesExam} min={grille.nb_examens} onChange={setColonnesExam} />
              </div>
            )}
          </div>

          <div className={`${CARTE} overflow-hidden`}>
            {grille.notes.length === 0 ? (
              <Vide texte="Aucun étudiant inscrit dans cette classe." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs font-semibold text-iss-gray uppercase tracking-wide border-b border-gray-100">
                      <th className="px-3 py-3 text-left sticky left-0 bg-white z-10">Étudiant</th>
                      {Array.from({ length: colonnesDS }, (_, i) => (
                        <th key={`ds-${i}`} className="px-2 py-3 text-center w-[70px]">DS {i + 1}</th>
                      ))}
                      {aDesTP && <th className="px-2 py-3 text-center w-[70px] bg-amber-50/60">TP</th>}
                      {Array.from({ length: colonnesExam }, (_, i) => (
                        <th key={`ex-${i}`} className="px-2 py-3 text-center w-[70px]">Exam {i + 1}</th>
                      ))}
                      <th className="px-2 py-3 text-center w-[70px] bg-gray-50">Moy.</th>
                      <th className="px-2 py-3 text-center w-[75px]">Rattr.</th>
                      <th className="px-2 py-3 text-center w-[80px] bg-[#006633]/5">Retenue</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {grille.notes.map(note => {
                      const gele = verrouillee || note.verrouillee;
                      return (
                        <tr key={note.id} className="hover:bg-gray-50/60">
                          <td className="px-3 py-2 sticky left-0 bg-white z-10">
                            <div className="font-semibold text-iss-dark whitespace-nowrap">{note.etudiant_nom}</div>
                            <div className="text-xs text-iss-gray">{note.etudiant_matricule}</div>
                          </td>

                          {Array.from({ length: colonnesDS }, (_, i) => (
                            <td key={`ds-${i}`} className="px-1 py-2">
                              <CelluleNote
                                valeur={valeurCellule(note, `ds-${i + 1}`, valeurEvaluation(note, 'ds', i + 1))}
                                onChange={v => majCellule(note.id, `ds-${i + 1}`, v)}
                                desactive={gele}
                              />
                            </td>
                          ))}

                          {aDesTP && (
                            <td className="px-1 py-2 bg-amber-50/40">
                              <CelluleNote
                                valeur={valeurCellule(note, 'tp', note.note_tp)}
                                onChange={v => majCellule(note.id, 'tp', v)}
                                desactive={gele}
                              />
                            </td>
                          )}

                          {Array.from({ length: colonnesExam }, (_, i) => (
                            <td key={`ex-${i}`} className="px-1 py-2">
                              <CelluleNote
                                valeur={valeurCellule(note, `exam-${i + 1}`, valeurEvaluation(note, 'exam', i + 1))}
                                onChange={v => majCellule(note.id, `exam-${i + 1}`, v)}
                                desactive={gele}
                              />
                            </td>
                          ))}

                          <td className="px-2 py-2 text-center bg-gray-50 text-iss-gray font-semibold">
                            {fmtNote(note.moyenne)}
                          </td>
                          <td className="px-1 py-2">
                            <CelluleNote
                              valeur={valeurCellule(note, 'rattrapage', note.note_rattrapage)}
                              onChange={v => majCellule(note.id, 'rattrapage', v)}
                              desactive={gele}
                            />
                          </td>
                          <td className="px-2 py-2 text-center bg-[#006633]/5 font-bold text-[#006633]">
                            {fmtNote(note.note_retenue)}
                            {note.verrouillee && <Lock size={10} className="inline ml-1 text-iss-gray" />}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <p className="text-xs text-iss-gray leading-relaxed">
            Une case vide n&apos;est pas comptée : sa part est redistribuée sur les composantes
            saisies, pour qu&apos;un semestre en cours ne fasse pas chuter les moyennes.
            Un rattrapage ne remplace la moyenne que s&apos;il est meilleur.
            {' '}Les colonnes « Moy. » et « Retenue » se mettent à jour après enregistrement.
          </p>
        </>
      )}

      <Toast message={toast} />
    </div>
  );
}

function CompteurColonnes({
  label, valeur, min, onChange,
}: { label: string; valeur: number; min: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs font-semibold text-iss-gray">{label}</span>
      <button onClick={() => onChange(Math.max(Math.max(1, min), valeur - 1))}
              disabled={valeur <= Math.max(1, min)} title="Retirer une colonne"
              className="p-1 rounded-md border border-gray-200 text-iss-gray hover:bg-gray-100 disabled:opacity-40 transition-colors">
        <Minus size={12} />
      </button>
      <span className="text-sm font-bold text-iss-dark w-4 text-center">{valeur}</span>
      <button onClick={() => onChange(Math.min(20, valeur + 1))} disabled={valeur >= 20}
              title="Ajouter une colonne"
              className="p-1 rounded-md border border-gray-200 text-iss-gray hover:bg-gray-100 disabled:opacity-40 transition-colors">
        <Plus size={12} />
      </button>
    </div>
  );
}

function CelluleNote({
  valeur, onChange, desactive,
}: { valeur: string; onChange: (v: string) => void; desactive?: boolean }) {
  const n = Number(valeur);
  const invalide = valeur !== '' && (!Number.isFinite(n) || n < 0 || n > 20);
  return (
    <input
      type="number" min={0} max={20} step="0.25" value={valeur} disabled={desactive}
      onChange={e => onChange(e.target.value)}
      className={`w-full px-1.5 py-1.5 rounded-lg border text-sm text-center transition-all
        focus:outline-none focus:border-[#006633] disabled:opacity-45 disabled:bg-gray-50
        ${invalide ? 'border-red-400 bg-red-50 text-red-700' : 'border-gray-200 bg-white'}`}
    />
  );
}
