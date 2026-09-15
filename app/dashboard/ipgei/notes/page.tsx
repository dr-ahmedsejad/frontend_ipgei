'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  FileSpreadsheet, GraduationCap, Link2, Lock, Minus, Plus, RefreshCw, Save,
} from 'lucide-react';

import {
  BTN_PRIMAIRE, BTN_SECONDAIRE, Badge, CARTE, Chargement, DEGRADE, EnTetePage,
  Erreur, SELECT, Toast, Vide, fmtCoef, fmtNote,
} from '../_ui';
import {
  anneeParDefaut, libelleSemestreSession, typeSemestreSession,
} from '../_annee';
import {
  useAnneesIPGEI, useClassesSelect, useGrilleNotes, useMatieresSelect,
  useNoteMutations, useSemestresAll,
} from '@/lib/api/ipgei-hooks';
import type { Note, SaisieLigneNote, TypeEvaluation } from '@/types/ipgei';

/** Une cellule modifiée, pas encore envoyée. */
type Brouillon = Record<string, string>;

const cle = (noteId: number, champ: string) => `${noteId}:${champ}`;

/**
 * Un semestre relève-t-il de la période de session ?
 *
 * S1 et S3 sont impairs, S2 et S4 pairs — le rang est porté par le chiffre du
 * code, et c'est la seule source : un semestre nommé autrement n'appartient à
 * aucune période et reste proposé, faute de quoi on le ferait disparaître sans
 * pouvoir dire pourquoi.
 */
function estDeLaPeriode(code: string, periode: 'I' | 'P'): boolean {
  const rang = Number(code.replace(/\D/g, ''));
  if (!Number.isInteger(rang) || rang === 0) return true;
  return periode === 'I' ? rang % 2 === 1 : rang % 2 === 0;
}

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
  //
  // La PÉRIODE DE SESSION tranche le reste. L'utilisateur a choisi ses
  // semestres impairs ou pairs à la connexion, et c'est cette période qu'il
  // croit saisir : lui proposer les quatre revenait à laisser écrire des notes
  // de S2 pendant la campagne de S1, sans que rien ne le signale. Croisée avec
  // le niveau, elle ne laisse qu'un semestre — S1 pour une MPSI en période
  // impaire, S3 pour une MP.
  const periode = typeSemestreSession();
  const semestresDuNiveau = useMemo(
    () => semestres.filter(s => (anneeOuverte ? !s.est_cloture : true)
                             && (!classe || s.niveaux.includes(classe.niveau))
                             && estDeLaPeriode(s.code, periode)),
    [classe, semestres, anneeOuverte, periode],
  );

  const { data: matieres = [] } = useMatieresSelect({
    code_semestre: semestre?.code, actif: true,
  });

  // Réinitialise les sélections devenues incohérentes après un changement amont.
  // La liste vide ne compte pas : c'est l'état pendant le chargement, et effacer
  // à ce moment-là annulerait une présélection venue de « Mes feuilles ».
  // Le semestre découle de la classe : période et niveau ne laissent qu'un
  // candidat, et le faire choisir revenait à demander de confirmer une
  // évidence. On le pose donc dès que la classe est prise, et on ne laisse le
  // choix ouvert que s'il y en a vraiment un.
  useEffect(() => {
    if (!semestresDuNiveau.length) return;         // liste encore en vol
    const valide = semestreId
      && semestresDuNiveau.some(s => s.id === semestreId);
    if (valide) return;
    setSemestreId(semestresDuNiveau.length === 1 ? semestresDuNiveau[0].id : null);
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
  // Le rattrapage a son propre onglet : il relève de l'autre campagne et ne se
  // saisit qu'après les résultats, jamais le jour où l'on rend un DS.
  const [epreuve, setEpreuve] = useState<'ds' | 'exam' | 'rattrapage'>('ds');
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

  // Enseignement partagé : cette matière suit le même cours qu'une autre. Les
  // DS et le TP sont composés là-bas et valent ici — on les AFFICHE, en lecture
  // seule, plutôt que de laisser des colonnes vides qui inviteraient à
  // ressaisir un devoir déjà noté. Seul l'examen se saisit sur cet écran.
  const partage       = grille?.partage ?? null;
  const notesPartagees = useMemo(() => {
    const index = new Map<number, Note>();
    for (const n of partage?.notes ?? []) index.set(n.inscription, n);
    return index;
  }, [partage]);
  /** La ligne où lire les DS et le TP : celle de la porteuse, ou la sienne. */
  const source = (note: Note) => (partage ? notesPartagees.get(note.inscription) : note);

  // Chaque campagne a sa fenêtre : les DS relèvent de la session normale, le
  // rattrapage de la sienne. Griser la bonne colonne évite de laisser saisir
  // puis de rejeter à l'enregistrement.
  const saisieNormale    = grille?.saisie_normale ?? false;
  const saisieRattrapage = grille?.saisie_rattrapage ?? false;
  const enLecture        = !anneeOuverte || (!saisieNormale && !saisieRattrapage);

  // CAMPAGNE DE RATTRAPAGE FERMÉE : on consulte, on ne saisit pas.
  //
  // L'onglet reste accessible — il faut pouvoir relire un rattrapage déjà
  // saisi, ne serait-ce que pour vérifier un dossier après coup. Ce sont les
  // cellules qui refusent l'écriture, et il faut le DIRE : sans cela on croit
  // saisir et rien ne part, ce qui est pire qu'un onglet fermé.
  const rattrapageFerme = !saisieRattrapage;

  // Passer d'un onglet à l'autre masque des saisies non enregistrées : les
  // compter par épreuve évite de croire qu'on a tout envoyé.
  const enAttente = (cible: 'ds' | 'exam' | 'rattrapage') =>
    Object.keys(brouillon).filter(k => {
      const champ = k.split(':')[1] ?? '';
      if (cible === 'ds')   return champ.startsWith('ds-') || champ === 'tp';
      if (cible === 'exam') return champ.startsWith('exam-');
      return champ === 'rattrapage';
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
            {/* Reporter une pile de copies à la main prend l'après-midi : le
                classeur de collecte se verse d'un fichier. Le lien est ici
                parce que c'est ici qu'on est quand on cherche à saisir. */}
            <Link href="/dashboard/ipgei/notes/import" className={BTN_SECONDAIRE}>
              <FileSpreadsheet size={14} /> Importer des notes
            </Link>
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
            <div className="flex items-baseline justify-between gap-2 mb-1.5">
              <label className="block text-xs font-semibold text-iss-dark">Semestre</label>
              {/* La période vient de la session, pas de cet écran : on la
                  montre sans la rendre modifiable, sinon la liste courte
                  passerait pour une liste incomplète. */}
              <span className="text-[11px] text-iss-gray">{libelleSemestreSession()}</span>
            </div>
            <select value={semestreId ?? ''} className={SELECT} disabled={!classeId}
                    onChange={e => setSemestreId(e.target.value ? Number(e.target.value) : null)}>
              {/* Pas de « Choisir… » quand il n'y a rien à choisir : le
                  semestre est déjà posé, et proposer de le vider n'ouvrirait
                  que sur une grille fermée. */}
              {semestresDuNiveau.length !== 1 && <option value="">Choisir…</option>}
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

            {partage && (
              <Badge ton="ambre">
                <Link2 size={10} className="inline mr-1" />
                Même enseignement que {partage.matiere.code}
              </Badge>
            )}

            {!verrouillee && epreuve !== 'rattrapage' && (
              <div className="ml-auto flex items-center gap-4">
                {epreuve === 'ds'
                  ? <CompteurColonnes label="DS" valeur={colonnesDS} min={grille.nb_ds} onChange={setColonnesDS} />
                  : <CompteurColonnes label="Examens" valeur={colonnesExam} min={grille.nb_examens} onChange={setColonnesExam} />}
              </div>
            )}
          </div>

          {/* Une épreuve à la fois : on corrige un paquet de copies, pas une
              matière entière. « Moy. » et « Retenue » restent visibles partout —
              c'est ce qu'on vérifie en saisissant. */}
          <div className="flex gap-1.5">
            {([
              { cle: 'ds',
                label: partage
                  ? `Devoirs surveillés — ${partage.matiere.code}`
                  : `Devoirs surveillés (${colonnesDS})` },
              { cle: 'exam', label: `Examens (${colonnesExam})` },
              { cle: 'rattrapage', label: 'Rattrapage' },
            ] as const).map(onglet => {
              const attente = enAttente(onglet.cle);
              // L'onglet reste OUVERT même campagne fermée : on doit pouvoir
              // relire un rattrapage déjà saisi pour vérifier un dossier. Ce
              // sont les cellules qui refusent, et le bandeau qui l'annonce.
              const ferme   = onglet.cle === 'rattrapage' && rattrapageFerme;
              return (
                <button key={onglet.cle} onClick={() => setEpreuve(onglet.cle)}
                        title={ferme
                          ? 'Campagne de rattrapage fermée — consultation seule.'
                          : undefined}
                        className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors flex items-center gap-2 ${
                          epreuve === onglet.cle
                            ? 'text-white'
                            : 'text-iss-gray border border-gray-200 hover:bg-gray-50'
                        }`}
                        style={epreuve === onglet.cle ? { background: DEGRADE } : {}}>
                  {ferme && <Lock size={11} className="flex-shrink-0 opacity-70" />}
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

          {/* Le cadenas de l'onglet est discret ; ce bandeau ne l'est pas.
              Sans lui, on tape dans des cases mortes et l'on croit avoir
              saisi — le défaut d'origine, qu'ouvrir l'onglet en lecture seule
              rétablirait tel quel. */}
          {epreuve === 'rattrapage' && rattrapageFerme && (
            <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl border
                            border-amber-200 bg-amber-50 text-amber-800">
              <Lock size={14} className="mt-0.5 flex-shrink-0" />
              <p className="text-sm">
                <span className="font-semibold">Consultation seule.</span>{' '}
                La campagne de rattrapage n&apos;est pas ouverte : les notes déjà
                saisies restent lisibles, mais aucune ne peut être modifiée.{' '}
                <Link href="/dashboard/ipgei/notes/sessions"
                      className="font-semibold underline hover:no-underline">
                  Ouvrir la campagne
                </Link>
              </p>
            </div>
          )}

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
                      {/* TP et colles partagent la même case : ce sont deux
                          formes du contrôle continu, notées ensemble, pas une
                          épreuve de fin de semestre. */}
                      {epreuve === 'ds' && aDesTP && (
                        <th className="px-2 py-3 text-center w-[86px] bg-amber-50/60">TP/Colle</th>
                      )}
                      {epreuve === 'exam' && Array.from({ length: colonnesExam }, (_, i) => (
                        <th key={`ex-${i}`} className="px-2 py-3 text-center w-[70px]">Exam {i + 1}</th>
                      ))}
                      <th className="px-2 py-3 text-center w-[70px] bg-gray-50">Moy.</th>
                      {epreuve === 'rattrapage' && (
                        <th className="px-2 py-3 text-center w-[75px]">Rattr.</th>
                      )}
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

                          {epreuve === 'ds' && Array.from({ length: colonnesDS }, (_, i) => {
                            const lue = source(note);
                            return (
                              <td key={`ds-${i}`} className="px-1 py-2">
                                <CelluleNote
                                  valeur={partage
                                    ? (lue ? valeurEvaluation(lue, 'ds', i + 1) ?? '' : '')
                                    : valeurCellule(note, `ds-${i + 1}`, valeurEvaluation(note, 'ds', i + 1))}
                                  onChange={v => majCellule(note.id, `ds-${i + 1}`, v)}
                                  desactive={geleNormale || !!partage}
                                />
                              </td>
                            );
                          })}

                          {epreuve === 'ds' && aDesTP && (
                            <td className="px-1 py-2 bg-amber-50/40">
                              <CelluleNote
                                valeur={partage
                                  ? (source(note)?.note_tp ?? '')
                                  : valeurCellule(note, 'tp', note.note_tp)}
                                onChange={v => majCellule(note.id, 'tp', v)}
                                desactive={geleNormale || !!partage}
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
                          {epreuve === 'rattrapage' && (
                            <td className="px-1 py-2">
                              <CelluleNote
                                valeur={valeurCellule(note, 'rattrapage', note.note_rattrapage)}
                                onChange={v => majCellule(note.id, 'rattrapage', v)}
                                desactive={geleRattrapage}
                              />
                            </td>
                          )}
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

          {partage && (
            <div className={`${CARTE} px-4 py-3`} style={{ borderLeft: '3px solid #b45309' }}>
              <p className="text-xs text-iss-gray leading-relaxed">
                <strong className="text-iss-dark">
                  {grille.matiere.code} et {partage.matiere.code} sont un seul enseignement.
                </strong>{' '}
                Les devoirs surveillés et le TP sont composés une fois, sur{' '}
                <strong>{partage.matiere.code}</strong>, et valent pour les deux — ils
                s&apos;affichent ici en lecture seule.{' '}
                <strong>Seul l&apos;examen se saisit sur cet écran</strong>, et chaque
                matière garde son coefficient. Pour corriger un DS ou un TP, ouvrez la
                grille de {partage.matiere.code} : {grille.matiere.code} suivra
                automatiquement.
              </p>
            </div>
          )}

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
