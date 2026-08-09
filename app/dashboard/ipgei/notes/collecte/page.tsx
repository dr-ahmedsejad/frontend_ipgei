'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, Download, FileSpreadsheet, FileText, Loader2, Upload,
} from 'lucide-react';

import { downloadBlob } from '@/lib/downloadBlob';
import FileDropzone from '@/components/ui/FileDropzone';
import {
  BTN_PRIMAIRE, Badge, CARTE, DEGRADE, EnTetePage, Erreur, SELECT,
} from '../../_ui';
import { useAnneeIPGEI } from '../../_annee';
import {
  useAnonymats, useClassesSelect, useFicheCollecte, useImportNotes,
  useMatieresSelect, useSemestresAll, useSessions,
} from '@/lib/api/ipgei-hooks';
import type { BilanImportNotes, TypeNoteCollecte } from '@/lib/api/ipgei';

/**
 * Fiche de collecte de notes — la feuille que l'enseignant emporte en salle.
 *
 * Liste de ses étudiants, colonne de notes vide, colonne d'observations, bloc
 * de signature. Il la remplit à la main, la signe, et la scolarité reporte
 * ensuite les notes à l'écran. C'est le pendant papier de la grille de saisie,
 * et le serveur garantit le MÊME ordre : l'enseignant lit ligne à ligne pendant
 * qu'un agent tape, un ordre différent décalerait tout sans rien annoncer.
 *
 * Reprend le dispositif de SIGA (Évaluations → Collecte de notes) : mêmes
 * choix, mêmes formats, même feuille imprimée.
 */

/**
 * La campagne de saisie ne se choisit pas : elle se déduit de l'épreuve. Le
 * rattrapage relève de la seconde session, les trois autres de la normale.
 * Faire choisir les deux revenait à ressaisir la même chose, et laissait
 * demander un « DS de rattrapage » qui n'existe pas.
 */
const TYPES: { cle: TypeNoteCollecte; label: string }[] = [
  { cle: 'DS',   label: 'Devoir surveillé' },
  { cle: 'TP',   label: 'Travaux pratiques' },
  { cle: 'EXAM', label: 'Examen final' },
  { cle: 'RATT', label: 'Examen de rattrapage' },
];

export default function FicheCollectePage() {
  const { annee, setAnnee, options } = useAnneeIPGEI();

  const [semestreId, setSemestreId] = useState<number | null>(null);
  const [classeId,  setClasseId]  = useState<number | null>(null);
  const [matiereId, setMatiereId] = useState<number | null>(null);
  const [typeNote,  setTypeNote]  = useState<TypeNoteCollecte>('EXAM');
  const [anonymat,  setAnonymat]  = useState(false);
  const [format,    setFormat]    = useState<'pdf' | 'excel'>('pdf');
  const [erreur,    setErreur]    = useState<string | null>(null);
  const [fichier,   setFichier]   = useState<File | null>(null);
  const [bilan,     setBilan]     = useState<BilanImportNotes | null>(null);
  const [erreurImport, setErreurImport] = useState<string | null>(null);

  const { data: semestres = [] } = useSemestresAll({ annee_universitaire: annee });
  const { data: classes   = [] } = useClassesSelect({ annee_universitaire: annee, actif: true });
  const { data: sessions  = [] } = useSessions(annee);
  const editer = useFicheCollecte();
  const importer = useImportNotes();

  const semestre = semestres.find(s => s.id === semestreId) ?? null;
  const classe   = classes.find(c => c.id === classeId) ?? null;
  const rattrapage = typeNote === 'RATT';

  const classesReelles = useMemo(
    () => classes.filter(c => !c.est_conteneur), [classes]);

  // Un semestre appartient à une année d'étude : on ne propose que ceux que
  // suit le niveau de la classe choisie.
  const semestresOuverts = useMemo(
    () => (classe ? semestres.filter(s => s.niveaux.includes(classe.niveau)) : semestres),
    [semestres, classe],
  );

  // Les matières suivent le semestre, et le TP ne concerne que celles qui en
  // comportent : proposer les autres produirait une feuille que personne ne
  // remplira.
  const { data: matieres = [] } = useMatieresSelect({
    code_semestre: semestre?.code, actif: true,
    ...(typeNote === 'TP' ? { has_tp: true } : {}),
  });

  // L'anonymat n'a de sens que si les numéros ont été tirés pour la campagne
  // dont relève l'épreuve — celle-ci, et pas l'autre : un numéro de session
  // normale ne désigne pas le même candidat qu'un numéro de rattrapage.
  const campagne = sessions.find(
    s => s.semestre === semestreId
      && s.type_session === (rattrapage ? 'rattrapage' : 'normale')) ?? null;
  const { data: anonymats = [] } = useAnonymats(campagne?.id ?? null);
  // L'anonymat ne vaut que pour l'examen : un DS se corrige au fil du
  // semestre, souvent en classe, et un TP se note en séance — proposer une
  // feuille anonyme pour eux donnerait une garantie que rien ne tient.
  const anonymatPossible = typeNote === 'EXAM' || typeNote === 'RATT';
  const anonymatPret = anonymatPossible && anonymats.length > 0;

  const pret = !!semestreId && !!classeId;

  const telecharger = () => {
    if (!pret || !semestre || !classe) return;
    setErreur(null);
    editer.mutate(
      {
        semestre: semestre.id, classe: classe.id,
        matiere: matiereId ?? undefined,
        type_note: typeNote,
        anonymat: anonymat && anonymatPret ? 1 : 0,
        sortie: format,
      },
      {
        onSuccess: (blob) => {
          const matiere = matieres.find(m => m.id === matiereId);
          const nom = [
            'collecte', classe.nom.replace(/\s+/g, '_'),
            matiere ? matiere.code : 'toutes',
            typeNote, semestre.code,
          ].join('_');
          downloadBlob(blob, `${nom}.${format === 'excel' ? 'xlsx' : 'pdf'}`);
        },
        onError: (e) => setErreur(e instanceof Error ? e.message : 'Erreur'),
      },
    );
  };

  /**
   * Verse le classeur rempli. Le numéro d'épreuve suit celui de la fiche : un
   * devoir surveillé se rend au premier, et la grille sert à en saisir un
   * second — l'écran ne le demande pas pour ne pas faire choisir un rang que
   * la fiche ne porte pas.
   */
  const verser = () => {
    if (!fichier || !semestre || !classe) return;
    setErreurImport(null);
    setBilan(null);
    importer.mutate(
      { fichier, semestre: semestre.id, classe: classe.id, type_note: typeNote },
      {
        onSuccess: (r) => { setBilan(r); setFichier(null); },
        onError:   (e) => setErreurImport(e instanceof Error ? e.message : 'Erreur'),
      },
    );
  };

  return (
    <div className="space-y-5 max-w-2xl">
      <Link href="/dashboard/ipgei/notes"
            className="inline-flex items-center gap-1.5 text-sm text-iss-gray hover:text-[#006633] transition-colors">
        <ArrowLeft size={14} /> Saisie des notes
      </Link>

      <EnTetePage
        icone={<FileText size={14} className="text-white" />}
        titre="Fiche de collecte de notes"
        sousTitre="La feuille que l'enseignant emporte en salle, dans l'ordre exact de la grille de saisie."
        actions={
          <select value={annee} onChange={e => { setAnnee(e.target.value); setSemestreId(null); }}
                  className={SELECT} style={{ width: 140 }}>
            {options.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        }
      />

      <div className={`${CARTE} p-6 space-y-4`}>

        <div>
          <label className="block text-xs font-semibold text-iss-dark mb-1.5">
            Classe <span className="text-red-600">*</span>
          </label>
          <select value={classeId ?? ''} className={SELECT}
                  onChange={e => { setClasseId(e.target.value ? Number(e.target.value) : null);
                                   setSemestreId(null); setMatiereId(null); }}>
            <option value="">— Choisir —</option>
            {classesReelles.map(c => (
              <option key={c.id} value={c.id}>{c.nom}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-iss-dark mb-1.5">
            Semestre <span className="text-red-600">*</span>
          </label>
          <select value={semestreId ?? ''} className={SELECT} disabled={!classeId}
                  onChange={e => { setSemestreId(e.target.value ? Number(e.target.value) : null);
                                   setMatiereId(null); }}>
            <option value="">— Choisir —</option>
            {semestresOuverts.map(s => (
              <option key={s.id} value={s.id}>{s.code} — {s.libelle_annee}</option>
            ))}
          </select>
          {classeId && semestresOuverts.length === 0 && (
            <p className="mt-1.5 text-xs text-amber-700">
              Aucun semestre ouvert pour le niveau de cette classe en {annee}.
            </p>
          )}
        </div>

        <div>
          <label className="block text-xs font-semibold text-iss-dark mb-1.5">Matière</label>
          <select value={matiereId ?? ''} className={SELECT} disabled={!semestreId}
                  onChange={e => setMatiereId(e.target.value ? Number(e.target.value) : null)}>
            <option value="">Toutes les matières du semestre</option>
            {/* L'intitulé seul, comme sur la fiche : le code ne parle qu'à la
                scolarité, et la liste est déjà restreinte à un semestre. */}
            {matieres.map(m => (
              <option key={m.id} value={m.id}>{m.intitule}</option>
            ))}
          </select>
          <p className="mt-1.5 text-xs text-iss-gray">
            Laissée sur «&nbsp;toutes&nbsp;», l&apos;édition produit le jeu complet
            de la classe — une fiche par matière, chacune sur sa page.
          </p>
        </div>

        <div>
          <label className="block text-xs font-semibold text-iss-dark mb-2">
            Type de note <span className="text-red-600">*</span>
          </label>
          <div className="grid gap-2 sm:grid-cols-2">
            {TYPES.map(t => (
              <label key={t.cle} className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="type_note" value={t.cle}
                       checked={typeNote === t.cle}
                       onChange={() => { setTypeNote(t.cle); setMatiereId(null); }}
                       className="accent-[#006633]" />
                <span className="text-sm text-iss-dark">{t.label}</span>
              </label>
            ))}
          </div>
          {rattrapage && (
            <p className="mt-2 text-xs text-amber-700">
              La feuille ne portera que les étudiants dont la moyenne de la
              matière reste sous le seuil : convoquer toute la classe ferait
              signer des présents qui n&apos;avaient rien à repasser.
            </p>
          )}
        </div>

        <div>
          <label className={`flex items-center gap-2 text-sm ${anonymatPret ? '' : 'opacity-50'}`}>
            <input type="checkbox" className="accent-[#006633]"
                   checked={anonymat && anonymatPret} disabled={!anonymatPret}
                   onChange={e => setAnonymat(e.target.checked)} />
            Copies anonymes
            {/* Rien à dire quand les numéros existent : la case parle d'elle-même.
                L'absence de tirage, elle, doit s'annoncer — sans elle la case
                grisée resterait inexpliquée. */}
            {!anonymatPossible ? (
              <span className="text-xs text-iss-gray">
                — réservé à l&apos;examen
              </span>
            ) : !anonymatPret && (
              <span className="text-xs text-iss-gray">
                — aucun numéro tiré pour cette épreuve
              </span>
            )}
          </label>
          {anonymatPossible && !anonymatPret && semestreId && (
            <p className="mt-1 text-xs text-iss-gray">
              Les numéros se tirent depuis{' '}
              <Link href="/dashboard/ipgei/notes/anonymat"
                    className="text-[#006633] font-medium hover:underline">
                Anonymat des copies
              </Link>.
            </p>
          )}
        </div>

        <div>
          <label className="block text-xs font-semibold text-iss-dark mb-2">Format</label>
          <div className="flex gap-4">
            {(['pdf', 'excel'] as const).map(f => (
              <label key={f} className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="format" value={f} checked={format === f}
                       onChange={() => setFormat(f)} className="accent-[#006633]" />
                <span className="text-sm text-iss-dark inline-flex items-center gap-1.5">
                  {f === 'pdf' ? <FileText size={13} /> : <FileSpreadsheet size={13} />}
                  {f === 'pdf' ? 'PDF à imprimer' : 'Excel à remplir'}
                </span>
              </label>
            ))}
          </div>
        </div>

        {erreur && <Erreur erreur={new Error(erreur)} />}

        <button onClick={telecharger} disabled={!pret || editer.isPending}
                className={`${BTN_PRIMAIRE} w-full justify-center`} style={{ background: DEGRADE }}>
          {editer.isPending
            ? <><Loader2 size={14} className="animate-spin" /> Édition en cours…</>
            : <><Download size={14} /> Télécharger la fiche</>}
        </button>
      </div>

      {/* ── Le retour de la fiche ────────────────────────────────────────
          La feuille qu'on lit est celle qu'on écrit : aucun gabarit à part,
          rien à documenter. L'enseignant remplit la colonne « Note /20 » du
          fichier téléchargé ci-dessus et le renvoie tel quel. */}
      <div className={`${CARTE} p-6 space-y-4`}>
        <div>
          <h2 className="text-sm font-bold text-iss-dark">Reporter une fiche remplie</h2>
          <p className="text-xs text-iss-gray mt-1">
            Renvoyez le classeur Excel téléchargé ci-dessus, la colonne
            «&nbsp;Note /20&nbsp;» remplie. Les matières sont lues dans les
            onglets&nbsp;; les cases laissées vides ne touchent à rien.
          </p>
        </div>

        <FileDropzone
          label="Classeur rempli"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          maxSizeMb={5}
          value={fichier}
          onChange={(f) => { setFichier(f); setBilan(null); setErreurImport(null); }}
          hint={classe && semestre
            ? `Versé dans ${classe.nom} — ${semestre.code}, au titre de « ${
                TYPES.find(t => t.cle === typeNote)?.label} ».`
            : "Choisissez d'abord la classe et le semestre ci-dessus."}
        />

        {erreurImport && <Erreur erreur={new Error(erreurImport)} />}

        <button onClick={verser} disabled={!fichier || !pret || importer.isPending}
                className={`${BTN_PRIMAIRE} w-full justify-center`}
                style={{ background: DEGRADE }}>
          {importer.isPending
            ? <><Loader2 size={14} className="animate-spin" /> Report en cours…</>
            : <><Upload size={14} /> Reporter les notes</>}
        </button>

        {bilan && (
          <div className="space-y-2 pt-1"
               style={{ borderTop: '1px solid #f1f5f9' }}>
            <div className="flex items-center gap-2 flex-wrap pt-3">
              <Badge ton={bilan.erreurs.length ? 'ambre' : 'vert'}>
                {bilan.saisies} note{bilan.saisies > 1 ? 's' : ''}
              </Badge>
              <span className="text-sm text-iss-dark">
                report&eacute;e{bilan.saisies > 1 ? 's' : ''} sur{' '}
                {bilan.matieres.length} mati&egrave;re{bilan.matieres.length > 1 ? 's' : ''}
              </span>
            </div>

            {/* Le compte des cases vides n'est pas décoratif : c'est lui qui
                dit qu'une pile n'est corrigée qu'à moitié. */}
            {bilan.ignorees > 0 && (
              <p className="text-xs text-iss-gray">
                {bilan.ignorees} case{bilan.ignorees > 1 ? 's' : ''} laiss&eacute;e
                {bilan.ignorees > 1 ? 's' : ''} vide{bilan.ignorees > 1 ? 's' : ''} —
                les notes d&eacute;j&agrave; saisies sont intactes.
              </p>
            )}

            <ul className="text-xs text-iss-gray space-y-0.5">
              {bilan.matieres.map(m => (
                <li key={m.feuille}>
                  <b className="text-iss-dark">{m.matiere}</b> — {m.saisies} report&eacute;e
                  {m.saisies > 1 ? 's' : ''}
                  {m.ignorees > 0 && `, ${m.ignorees} vide${m.ignorees > 1 ? 's' : ''}`}
                </li>
              ))}
            </ul>

            {/* Une ligne refusée n'interrompt pas les autres — mais elle doit se
                lire, sinon on croit la classe saisie. */}
            {bilan.erreurs.map((e, i) => (
              <p key={`${e.feuille}-${e.ligne}-${i}`} className="text-xs text-amber-700">
                <b>{e.feuille}</b>, ligne {e.ligne} — {e.motif}
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
