'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, FileUp, Loader2, Upload } from 'lucide-react';

import FileDropzone from '@/components/ui/FileDropzone';
import {
  BTN_PRIMAIRE, Badge, CARTE, DEGRADE, EnTetePage, Erreur, SELECT,
} from '../../_ui';
import { useAnneeIPGEI } from '../../_annee';
import {
  useClassesSelect, useImportNotes, useMatieresSelect, useSemestresAll,
} from '@/lib/api/ipgei-hooks';
import type { BilanImportNotes, TypeNoteCollecte } from '@/lib/api/ipgei';

/**
 * Report d'un classeur de collecte rempli.
 *
 * Le fichier attendu est CELUI que l'écran des fiches produit : mêmes onglets,
 * mêmes colonnes. L'enseignant remplit « Note /20 » et renvoie le classeur —
 * aucun gabarit à part, rien à documenter, rien qui puisse diverger de
 * l'export.
 *
 * La matière est FACULTATIVE : le serveur la lit dans chaque onglet, et sans
 * choix le classeur entier est versé — c'est ainsi qu'on reporte un semestre
 * complet d'un fichier. La désigner sert à n'en verser qu'un onglet, sans
 * découper le classeur.
 *
 * L'épreuve, elle, est obligatoire et vient de l'écran : une fiche de devoir
 * surveillé rouverte pour saisir l'examen se verserait sinon dans le devoir.
 */

const TYPES: { cle: TypeNoteCollecte; label: string }[] = [
  { cle: 'DS',   label: 'Devoir surveillé' },
  { cle: 'TP',   label: 'Travaux pratiques' },
  { cle: 'EXAM', label: 'Examen final' },
  { cle: 'RATT', label: 'Examen de rattrapage' },
];

export default function ImportNotesPage() {
  const { annee, setAnnee, options } = useAnneeIPGEI();

  const [classeId,   setClasseId]   = useState<number | null>(null);
  const [semestreId, setSemestreId] = useState<number | null>(null);
  const [matiereId,  setMatiereId]  = useState<number | null>(null);
  const [typeNote,   setTypeNote]   = useState<TypeNoteCollecte>('EXAM');
  const [numero,     setNumero]     = useState(1);
  const [fichier,    setFichier]    = useState<File | null>(null);
  const [bilan,      setBilan]      = useState<BilanImportNotes | null>(null);
  const [erreur,     setErreur]     = useState<string | null>(null);

  const { data: classes   = [] } = useClassesSelect({ annee_universitaire: annee, actif: true });
  const { data: semestres = [] } = useSemestresAll({ annee_universitaire: annee });
  const importer = useImportNotes();

  const classe   = classes.find(c => c.id === classeId) ?? null;
  const semestre = semestres.find(s => s.id === semestreId) ?? null;
  const reelles  = useMemo(() => classes.filter(c => !c.est_conteneur), [classes]);
  // Un semestre appartient à une année d'étude : seuls ceux du niveau de la
  // classe ont un sens ici.
  const semestresOuverts = useMemo(
    () => (classe ? semestres.filter(s => s.niveaux.includes(classe.niveau)) : []),
    [semestres, classe],
  );

  // Les matières suivent le semestre, et le TP ne concerne que celles qui en
  // comportent : proposer les autres offrirait un onglet qui n'existe pas.
  const { data: matieres = [] } = useMatieresSelect({
    code_semestre: semestre?.code, actif: true,
    ...(typeNote === 'TP' ? { has_tp: true } : {}),
  });

  const pret = !!classeId && !!semestreId && !!fichier;

  const verser = () => {
    if (!pret || !classe || !semestre || !fichier) return;
    setErreur(null);
    setBilan(null);
    importer.mutate(
      {
        fichier, semestre: semestre.id, classe: classe.id,
        type_note: typeNote, numero,
        matiere: matiereId ?? undefined,
      },
      {
        onSuccess: (r) => { setBilan(r); setFichier(null); },
        onError:   (e) => setErreur(e instanceof Error ? e.message : 'Erreur'),
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
        icone={<FileUp size={14} className="text-white" />}
        titre="Import Excel des notes"
        sousTitre="Renvoyez la fiche de collecte remplie — les matières sont lues dans les onglets."
        actions={
          <select value={annee}
                  onChange={e => { setAnnee(e.target.value); setClasseId(null); setSemestreId(null); }}
                  className={SELECT} style={{ width: 140 }}>
            {options.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        }
      />

      <div className={`${CARTE} p-6 space-y-4`}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-semibold text-iss-dark mb-1.5">
              Classe <span className="text-red-600">*</span>
            </label>
            <select value={classeId ?? ''} className={SELECT}
                    onChange={e => { setClasseId(e.target.value ? Number(e.target.value) : null);
                                     setSemestreId(null); setBilan(null); }}>
              <option value="">— Choisir —</option>
              {reelles.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-iss-dark mb-1.5">
              Semestre <span className="text-red-600">*</span>
            </label>
            <select value={semestreId ?? ''} className={SELECT} disabled={!classeId}
                    onChange={e => { setSemestreId(e.target.value ? Number(e.target.value) : null);
                                     setBilan(null); }}>
              <option value="">— Choisir —</option>
              {semestresOuverts.map(s => (
                <option key={s.id} value={s.id}>{s.code} — {s.libelle_annee}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-iss-dark mb-1.5">
            Matière
          </label>
          <select value={matiereId ?? ''} className={SELECT} disabled={!semestreId}
                  onChange={e => { setMatiereId(e.target.value ? Number(e.target.value) : null);
                                   setBilan(null); }}>
            <option value="">Toutes les matières du classeur</option>
            {matieres.map(m => <option key={m.id} value={m.id}>{m.intitule}</option>)}
          </select>
          {/* Le classeur porte un onglet par matière : sans choix, tous sont
              versés — c'est ainsi qu'on reporte un semestre entier d'un
              fichier. Le choix sert à n'en verser qu'un. */}
          <p className="text-xs text-iss-gray mt-1.5">
            Laissez «&nbsp;Toutes&nbsp;» pour verser le classeur entier ; choisissez
            une matière pour n&apos;en reporter qu&apos;un onglet.
          </p>
        </div>

        <div>
          <label className="block text-xs font-semibold text-iss-dark mb-2">
            Épreuve à remplir <span className="text-red-600">*</span>
          </label>
          <div className="space-y-1.5">
            {TYPES.map(t => (
              <label key={t.cle} className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="type" value={t.cle} checked={typeNote === t.cle}
                       onChange={() => { setTypeNote(t.cle); setMatiereId(null); setBilan(null); }}
                       className="accent-[#006633]" />
                <span className="text-sm text-iss-dark">{t.label}</span>
              </label>
            ))}
          </div>
          {/* Le rang n'existe que pour le devoir surveillé : il peut y en avoir
              plusieurs dans un semestre, et verser le second sur le premier
              l'écraserait sans rien dire. */}
          {typeNote === 'DS' && (
            <div className="mt-3 flex items-center gap-2">
              <label className="text-xs font-semibold text-iss-dark">Devoir n°</label>
              <input type="number" min={1} max={9} value={numero}
                     onChange={e => setNumero(Math.max(1, Number(e.target.value) || 1))}
                     className={`${SELECT} w-20 text-center`} />
              <span className="text-xs text-iss-gray">
                le rang du devoir dans le semestre — le n° 2 ne remplace pas le n° 1.
              </span>
            </div>
          )}
        </div>

        <FileDropzone
          label="Classeur rempli"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          maxSizeMb={5}
          value={fichier}
          onChange={(f) => { setFichier(f); setBilan(null); setErreur(null); }}
          hint={classe && semestre
            ? `Versé dans ${classe.nom} — ${semestre.code}, au titre de « ${
                TYPES.find(t => t.cle === typeNote)?.label} ». Les cases laissées vides ne touchent à rien.`
            : 'Choisissez la classe et le semestre ci-dessus.'}
        />

        <p className="text-xs text-iss-gray">
          Pas encore de fiche ?{' '}
          <Link href="/dashboard/ipgei/notes/collecte"
                className="text-[#006633] font-medium hover:underline">
            Éditez-la en Excel
          </Link>{' '}
          — c&apos;est ce fichier-là, rempli, qui se renvoie ici.
        </p>

        {erreur && <Erreur erreur={new Error(erreur)} />}

        <button onClick={verser} disabled={!pret || importer.isPending}
                className={`${BTN_PRIMAIRE} w-full justify-center`}
                style={{ background: DEGRADE }}>
          {importer.isPending
            ? <><Loader2 size={14} className="animate-spin" /> Report en cours…</>
            : <><Upload size={14} /> Reporter les notes</>}
        </button>
      </div>

      {bilan && (
        <div className={`${CARTE} p-4 space-y-2`}
             style={{ borderLeft: `3px solid ${bilan.erreurs.length ? '#d97706' : '#006633'}` }}>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge ton={bilan.erreurs.length ? 'ambre' : 'vert'}>
              {bilan.saisies} note{bilan.saisies > 1 ? 's' : ''}
            </Badge>
            <span className="text-sm text-iss-dark">
              reportée{bilan.saisies > 1 ? 's' : ''} sur {bilan.matieres.length} matière
              {bilan.matieres.length > 1 ? 's' : ''}
            </span>
          </div>

          {/* Le compte des cases vides n'est pas décoratif : c'est lui qui dit
              qu'une pile n'est corrigée qu'à moitié. */}
          {bilan.ignorees > 0 && (
            <p className="text-xs text-iss-gray">
              {bilan.ignorees} case{bilan.ignorees > 1 ? 's' : ''} laissée
              {bilan.ignorees > 1 ? 's' : ''} vide{bilan.ignorees > 1 ? 's' : ''} — les
              notes déjà saisies sont intactes.
            </p>
          )}

          <ul className="text-xs text-iss-gray space-y-0.5">
            {bilan.matieres.map(m => (
              <li key={m.feuille}>
                <b className="text-iss-dark">{m.matiere}</b> — {m.saisies} reportée
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
  );
}
