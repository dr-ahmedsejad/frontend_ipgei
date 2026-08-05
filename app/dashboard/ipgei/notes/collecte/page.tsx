'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Download, FileSpreadsheet, FileText, Loader2 } from 'lucide-react';

import { downloadBlob } from '@/lib/downloadBlob';
import {
  BTN_PRIMAIRE, CARTE, DEGRADE, EnTetePage, Erreur, SELECT,
} from '../../_ui';
import { useAnneeIPGEI } from '../../_annee';
import {
  useAnonymats, useClassesSelect, useFicheCollecte, useMatieresSelect,
  useSemestresAll, useSessions,
} from '@/lib/api/ipgei-hooks';
import type { TypeNoteCollecte } from '@/lib/api/ipgei';

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
const TYPES: { cle: TypeNoteCollecte; label: string; detail?: string }[] = [
  { cle: 'DS',   label: 'Devoir surveillé',      detail: 'Contrôles du semestre' },
  { cle: 'TP',   label: 'Travaux pratiques' },
  { cle: 'EXAM', label: 'Examen final',          detail: 'Épreuve de fin de semestre' },
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

  const { data: semestres = [] } = useSemestresAll({ annee_universitaire: annee });
  const { data: classes   = [] } = useClassesSelect({ annee_universitaire: annee, actif: true });
  const { data: sessions  = [] } = useSessions(annee);
  const editer = useFicheCollecte();

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
  const anonymatPret = anonymats.length > 0;

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
                {t.detail && <span className="text-xs text-iss-gray">— {t.detail}</span>}
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
            {!anonymatPret && (
              <span className="text-xs text-iss-gray">
                — aucun numéro tiré pour cette épreuve
              </span>
            )}
          </label>
          {!anonymatPret && semestreId && (
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
    </div>
  );
}
