'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { GraduationCap, Lock, Minus, Plus, RefreshCw, Save } from 'lucide-react';

import {
  BTN_PRIMAIRE, BTN_SECONDAIRE, Badge, CARTE, Chargement, DEGRADE, EnTetePage,
  Erreur, SELECT, Toast, Vide, fmtCoef, fmtNote,
} from '../_ui';
import { anneeParDefaut } from '../_annee';
import {
  useAnneesIPGEI, useClassesSelect, useGrilleNotes, useMatieresSelect,
  useNoteMutations, useSemestresAll,
} from '@/lib/api/ipgei-hooks';
import type { Note, SaisieLigneNote, TypeEvaluation } from '@/types/ipgei';

/** Une cellule modifiée, pas encore envoyée. */
type Brouillon = Record<string, string>;

const cle = (noteId: number, champ: string) => `${noteId}:${champ}`;

export default function SaisieNotesPage() {
  // L'année n'est pas un choix sur cet écran : c'est celle de la session. La
  // laisser sélectionnable invitait à saisir des notes dans une promotion qu'on
  // ne consulte pas — et rien ne le signalait avant l'enregistrement.
  // Ni affichée ni modifiable : la barre du haut porte déjà l'année de session,
  // et la répéter ici invitait à la croire propre à cet écran. « Mes feuilles de
  // notes » peut toutefois l'imposer par l'URL — sans quoi le lien mènerait à
  // une grille vide sans qu'on comprenne pourquoi.
  const [annee, setAnnee] = useState<string>(anneeParDefaut());
  const { data: anneesOuvertes = [], isLoading: chargeAnnees } = useAnneesIPGEI(true);
  // Tant que la liste n'est pas revenue, on ne déclare rien close : afficher un
  // avertissement puis le retirer serait pire que d'attendre une seconde.
  const anneeOuverte = chargeAnnees || anneesOuvertes.includes(annee);

  const [classeId, setClasseId]     = useState<number | null>(null);
  const [semestreId, setSemestreId] = useState<number | null>(null);
  const [matiereId, setMatiereId]   = useState<number | null>(null);

  // Ouverture directe depuis « Mes feuilles de notes ». La lecture se fait au
  // montage plutôt qu'avec `useSearchParams`, qui imposerait une frontière
  // Suspense à toute la page pour trois paramètres facultatifs.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const lire = (cle: string) => {
      const valeur = Number(params.get(cle));
      return Number.isFinite(valeur) && valeur > 0 ? valeur : null;
    };
    const classe = lire('classe');
    const matiere = lire('matiere');
    const semestre = lire('semestre');
    const anneeDemandee = params.get('annee');
    if (anneeDemandee) setAnnee(anneeDemandee);
    if (classe)   setClasseId(classe);
    if (semestre) setSemestreId(semestre);
    if (matiere)  setMatiereId(matiere);
    // Au montage seulement : ensuite, les sélections appartiennent à l'écran.
  }, []);

  const { data: classes = [] }   = useClassesSelect({ annee_universitaire: annee, actif: true });
  const { data: semestres = [] } = useSemestresAll({ annee_universitaire: annee });

  const classe   = classes.find(c => c.id === classeId);
  const semestre = semestres.find(s => s.id === semestreId);

  // Le niveau de la classe borne les semestres proposés : une MPSI ne délibère
  // pas sur S3/S4.
  // Écran de saisie : on ne propose ni les semestres d'un autre niveau, ni les
  // semestres clôturés — sur ces derniers toute écriture serait refusée, et un
  // choix qui ne mène qu'à un message d'erreur n'en est pas un.
  const semestresDuNiveau = useMemo(
    () => semestres.filter(s => (anneeOuverte ? !s.est_cloture : true)
                             && (!classe || s.niveaux.includes(classe.niveau))),
    [classe, semestres, anneeOuverte],
  );

  const { data: matieres = [] } = useMatieresSelect({
    code_semestre: semestre?.code, actif: true,
  });

  // Réinitialise les sélections devenues incohérentes après un changement amont.
  // La liste vide ne compte pas : c'est l'état pendant le chargement, et effacer
  // à ce moment-là annulerait une présélection venue de « Mes feuilles ».
  useEffect(() => {
    if (semestresDuNiveau.length
        && semestreId && !semestresDuNiveau.some(s => s.id === semestreId)) {
      setSemestreId(null);
    }
  }, [semestresDuNiveau, semestreId]);
  useEffect(() => {
    if (matieres.length && matiereId && !matieres.some(m => m.id === matiereId)) {
      setMatiereId(null);
    }
  }, [matieres, matiereId]);

  const { data: grille, isLoading, error } = useGrilleNotes(classeId, matiereId, semestreId);
  const { saisieCollective, recalculerLot } = useNoteMutations();

  const [brouillon, setBrouillon] = useState<Brouillon>({});
  const [colonnesDS, setColonnesDS]   = useState(1);
  const [colonnesExam, setColonnesExam] = useState(1);
  // Les devoirs se saisissent au fil du semestre, les examens à la fin : les
  // mettre dans la même grille obligeait à défiler devant des colonnes qu'on ne
  // remplit pas ce jour-là, et exposait le reste aux fautes de frappe.
  const [epreuve, setEpreuve] = useState<'ds' | 'exam'>('ds');
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

  // Chaque campagne a sa fenêtre : les DS relèvent de la session normale, le
  // rattrapage de la sienne. Griser la bonne colonne évite de laisser saisir
  // puis de rejeter à l'enregistrement.
  const saisieNormale    = grille?.saisie_normale ?? false;
  const saisieRattrapage = grille?.saisie_rattrapage ?? false;
  const enLecture        = !anneeOuverte || (!saisieNormale && !saisieRattrapage);

  // Passer d'un onglet à l'autre masque des saisies non enregistrées : les
  // compter par épreuve évite de croire qu'on a tout envoyé.
  const enAttente = (cible: 'ds' | 'exam') =>
    Object.keys(brouillon).filter(k => {
      const champ = k.split(':')[1] ?? '';
      return cible === 'ds'
        ? champ.startsWith('ds-') || champ === 'tp'
        : champ.startsWith('exam-');
    }).length;

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
          // Année close : aucune action n'a de sens, pas même le recalcul.
          !anneeOuverte ? null : (
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
            <button onClick={enregistrer} disabled={!modifie || saisieCollective.isPending || enLecture}
                    className={BTN_PRIMAIRE} style={{ background: DEGRADE }}>
              <Save size={14} /> Enregistrer{modifie ? ` (${Object.keys(brouillon).length})` : ''}
            </button>
          </>
          )
        }
      />

      {/* Deux causes possibles — année close au registre, ou tous les semestres
          clôturés au calendrier — et le message ne peut pas trancher : il dit ce
          qui est sûr, puis où agir. Le commentaire reste hors du texte : à
          l'intérieur d'un paragraphe, une expression JSX en avale l'espace et
          soude les phrases. */}
      {!anneeOuverte && (
        <div className={`${CARTE} px-5 py-4 flex items-start gap-3.5`}
             style={{ borderLeft: '3px solid #d97706' }}>
          <Lock size={16} className="text-amber-600 mt-1 flex-shrink-0" />
          {/* `max-w-prose` borne la longueur de ligne : au-delà, l'œil perd le
              début de la ligne suivante et le message cesse d'être lu. */}
          <div className="space-y-2 max-w-prose">
            <p className="text-sm font-bold text-iss-dark leading-snug">
              Année {annee} clôturée
            </p>
            <p className="text-xs text-iss-gray leading-relaxed">
              La saisie des notes y est fermée. Les résultats acquis restent
              consultables dans les relevés et les procès-verbaux de délibération.
            </p>
            <p className="text-xs text-iss-gray leading-relaxed">
              Pour la rouvrir, passez par{' '}
              <strong className="text-iss-dark">Paramètres → Années</strong> —
              ou par les paramètres du cursus si un seul semestre est concerné.
            </p>
          </div>
        </div>
      )}

      {/* Année close : on ne propose rien. Laisser choisir une classe pour
          n'ouvrir qu'une grille inerte donnerait le sentiment d'un écran cassé
          plutôt que d'une année fermée. */}
      {anneeOuverte && (
      <div className={`${CARTE} p-4`}>
        <div className="grid gap-3 sm:grid-cols-3">
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
                <option key={s.id} value={s.id}>{s.code}</option>
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
      )}

      <Erreur erreur={error} />
      {erreurSauvegarde && <Erreur erreur={new Error(erreurSauvegarde)} />}

      {!anneeOuverte ? null : !pret ? (
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
            {verrouillee ? (
              <Badge ton="ambre"><Lock size={10} className="inline mr-1" />Semestre clôturé — lecture seule</Badge>
            ) : (
              <>
                <Badge ton={saisieNormale ? 'vert' : 'neutre'}>
                  {saisieNormale ? 'Session normale ouverte' : 'Session normale fermée'}
                </Badge>
                <Badge ton={saisieRattrapage ? 'vert' : 'neutre'}>
                  {saisieRattrapage ? 'Rattrapage ouvert' : 'Rattrapage fermé'}
                </Badge>
                <Link href="/dashboard/ipgei/notes/sessions"
                      className="text-xs font-semibold text-iss-primary hover:underline">
                  Gérer les campagnes
                </Link>
              </>
            )}

            {!verrouillee && (
              <div className="ml-auto flex items-center gap-4">
                {epreuve === 'ds'
                  ? <CompteurColonnes label="DS" valeur={colonnesDS} min={grille.nb_ds} onChange={setColonnesDS} />
                  : <CompteurColonnes label="Examens" valeur={colonnesExam} min={grille.nb_examens} onChange={setColonnesExam} />}
              </div>
            )}
          </div>

          {/* Une épreuve à la fois : on corrige un paquet de copies, pas une
              matière entière. Les colonnes calculées restent visibles des deux
              côtés — c'est ce qu'on vérifie en saisissant. */}
          <div className="flex gap-1.5">
            {([
              { cle: 'ds',   label: `Devoirs surveillés (${colonnesDS})` },
              { cle: 'exam', label: `Examens (${colonnesExam})` },
            ] as const).map(onglet => {
              const attente = enAttente(onglet.cle);
              return (
                <button key={onglet.cle} onClick={() => setEpreuve(onglet.cle)}
                        className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors flex items-center gap-2 ${
                          epreuve === onglet.cle
                            ? 'text-white'
                            : 'text-iss-gray border border-gray-200 hover:bg-gray-50'
                        }`}
                        style={epreuve === onglet.cle ? { background: DEGRADE } : {}}>
                  {onglet.label}
                  {attente > 0 && (
                    <span className={`px-1.5 py-0.5 rounded-md text-[11px] font-bold ${
                      epreuve === onglet.cle ? 'bg-white/25' : 'bg-amber-100 text-amber-700'
                    }`}>
                      {attente} à enregistrer
                    </span>
                  )}
                </button>
              );
            })}
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
                      {epreuve === 'ds' && Array.from({ length: colonnesDS }, (_, i) => (
                        <th key={`ds-${i}`} className="px-2 py-3 text-center w-[70px]">DS {i + 1}</th>
                      ))}
                      {/* Le TP accompagne les devoirs : c'est du contrôle
                          continu, pas une épreuve de fin de semestre. */}
                      {epreuve === 'ds' && aDesTP && (
                        <th className="px-2 py-3 text-center w-[70px] bg-amber-50/60">TP</th>
                      )}
                      {epreuve === 'exam' && Array.from({ length: colonnesExam }, (_, i) => (
                        <th key={`ex-${i}`} className="px-2 py-3 text-center w-[70px]">Exam {i + 1}</th>
                      ))}
                      <th className="px-2 py-3 text-center w-[70px] bg-gray-50">Moy.</th>
                      <th className="px-2 py-3 text-center w-[75px]">Rattr.</th>
                      <th className="px-2 py-3 text-center w-[80px] bg-[#006633]/5">Retenue</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {grille.notes.map(note => {
                      const geleNormale    = enLecture || !saisieNormale || note.verrouillee;
                      const geleRattrapage = enLecture || !saisieRattrapage || note.verrouillee;
                      return (
                        <tr key={note.id} className="hover:bg-gray-50/60">
                          <td className="px-3 py-2 sticky left-0 bg-white z-10">
                            <div className="font-semibold text-iss-dark whitespace-nowrap">{note.etudiant_nom}</div>
                            <div className="text-xs text-iss-gray">{note.etudiant_matricule}</div>
                          </td>

                          {epreuve === 'ds' && Array.from({ length: colonnesDS }, (_, i) => (
                            <td key={`ds-${i}`} className="px-1 py-2">
                              <CelluleNote
                                valeur={valeurCellule(note, `ds-${i + 1}`, valeurEvaluation(note, 'ds', i + 1))}
                                onChange={v => majCellule(note.id, `ds-${i + 1}`, v)}
                                desactive={geleNormale}
                              />
                            </td>
                          ))}

                          {epreuve === 'ds' && aDesTP && (
                            <td className="px-1 py-2 bg-amber-50/40">
                              <CelluleNote
                                valeur={valeurCellule(note, 'tp', note.note_tp)}
                                onChange={v => majCellule(note.id, 'tp', v)}
                                desactive={geleNormale}
                              />
                            </td>
                          )}

                          {epreuve === 'exam' && Array.from({ length: colonnesExam }, (_, i) => (
                            <td key={`ex-${i}`} className="px-1 py-2">
                              <CelluleNote
                                valeur={valeurCellule(note, `exam-${i + 1}`, valeurEvaluation(note, 'exam', i + 1))}
                                onChange={v => majCellule(note.id, `exam-${i + 1}`, v)}
                                desactive={geleNormale}
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
                              desactive={geleRattrapage}
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
