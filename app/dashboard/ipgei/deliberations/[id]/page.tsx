'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';

import type { TriDetailNotes } from '@/lib/api/ipgei';
import Link from 'next/link';
import {
  AlertTriangle, ArrowLeft, ArrowUpCircle, Calculator, CheckCircle2, Edit3,
  FileBadge, FileSignature, Repeat,
  FileText, Hourglass, Info, ListChecks, Loader2, Lock, Scale, Table2, Undo2,
  UserPlus, Users, X,
} from 'lucide-react';

import { ConfirmModal } from '@/components/ConfirmModal';
import {
  BTN_PRIMAIRE, BTN_SECONDAIRE, Badge, CARTE, Chargement, DEGRADE, EnTetePage,
  Erreur, INPUT, SELECT, Toast, Tuile, Vide, fmtCoef, fmtNote, tonDecision,
} from '../../_ui';
import { MenuActions, type ActionMenu } from '../../_menu-actions';
import { FilParcours } from './_fil-parcours';
import {
  useApercuPassage, useClassesSelect, useDeliberation, useDeliberationMutations,
  useCandidatsJury, useNiveauxCursus,
  useDocumentMutations, useJuryMutations, useLignesDeliberation, useMembresJury,
  useStatistiquesDeliberation,
} from '@/lib/api/ipgei-hooks';
import { ChampRecherche } from '../../_champ-recherche';
import { etatDeliberation, resumeEtat } from '../_etat';
import { formatDateTime } from '@/lib/formatters';
import { getStoredUser } from '@/lib/auth';
import { downloadBlob } from '@/lib/downloadBlob';
import {
  DECISIONS_PAR_NIVEAU, type BilanPassage, type LacuneDeliberation,
  type LigneDeliberation, type RoleJuryIPGEI,
} from '@/types/ipgei';

/**
 * Les deux décisions qui n'en sont pas tout à fait : elles n'ouvrent pas la
 * suite, elles ouvrent une étape de plus. Nommées ici parce que deux blocs
 * d'écran s'y réfèrent, et qu'une chaîne recopiée finit par diverger.
 */
const DECISION_RATTRAPAGE = 'autorise_rattrapage';
const DECISION_CNIM       = 'autorise_cnim';
/** La seule décision qui consomme un droit de redoublement. */
const DECISION_REDOUBLANT = 'redoublant';

/** Ce qui a fait bouger la situation depuis le jury, en toutes lettres. */
const ORIGINE_SITUATION: Record<string, string> = {
  concours:   'après le concours',
  rattrapage: 'après le rattrapage',
  '':         'aujourd’hui',
};

/**
 * Icône d'un bouton : le sablier remplace le pictogramme pendant l'action.
 *
 * Éditer un PV ou émettre trente décisions prend plusieurs secondes ; sans
 * signe visible, l'agent reclique, et l'on produit deux fois le même document
 * — chacun avec son propre numéro de série au registre.
 */
function IconeBouton({ enCours, Icone, taille = 14 }: {
  enCours: boolean;
  Icone:   React.ElementType;
  taille?: number;
}) {
  return enCours
    ? <Loader2 size={taille} className="animate-spin" />
    : <Icone size={taille} />;
}

export default function JuryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const deliberationId = Number(id);
  // Ouvrir le second jury mène DESSUS : on vient de le créer, c'est là qu'on
  // travaille ensuite.
  const router = useRouter();

  const [classeFiltre, setClasseFiltre] = useState('');
  const [toast, setToast]   = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [aValider, setAValider] = useState(false);
  const [aDevalider, setADevalider] = useState(false);
  // Seuil d'essai : le jury veut voir ce que donnerait 9,50 avant d'en décider.
  // Vide tant qu'il n'y touche pas — on n'envoie alors rien, et le seuil figé
  // à la création reste celui du calcul.
  const [seuilEssai, setSeuilEssai] = useState('');

  // Dévalider remet en cause des décisions notifiées : le backend le réserve à
  // un administrateur, l'écran n'a pas à proposer un bouton voué au 403.
  const moi = getStoredUser();
  const estAdmin = moi?.role === 'admin';

  const notifier = (m: string) => { setToast(m); setTimeout(() => setToast(null), 3200); };
  const signaler = (e: unknown) => setErreur(e instanceof Error ? e.message : 'Erreur');

  const { data: deliberation, isLoading } = useDeliberation(deliberationId);
  const { data: lignes = [], isLoading: chargeLignes } = useLignesDeliberation(
    deliberationId, classeFiltre ? Number(classeFiltre) : undefined,
  );
  const { data: stats } = useStatistiquesDeliberation(deliberationId);
  const { data: classes = [] } = useClassesSelect({
    annee_universitaire: deliberation?.annee_universitaire, actif: true,
  });
  // Le rang d'année ne se déduit pas d'un code de niveau : c'est le référentiel
  // du cursus qui dit que MPSI est une première année et MP une deuxième.
  const { data: niveauxCursus = [] } = useNiveauxCursus(true);

  const {
    calculer, valider, devalider, ajusterLigne, pvPdf, pvExcel, detailNotes,
    ouvrirRattrapage, pvFinal,
  } = useDeliberationMutations();
  const documents = useDocumentMutations();

  if (isLoading || !deliberation) return <Chargement />;

  const verrouillee = deliberation.est_verrouillee;
  const rattrapage = deliberation.portee === 'rattrapage';
  const nomPv = `PV-${deliberation.niveau}-`
    + `${deliberation.portee === 'semestre' ? deliberation.semestre_code
         : rattrapage ? 'rattrapage' : 'annuel'}-`
    + deliberation.annee_universitaire;
  const classesDuNiveau = classes.filter(c => c.niveau === deliberation.niveau);
  // La liste vient du serveur : un code de niveau seul ne dit pas s'il s'agit
  // d'une 1re ou d'une 2e année, donc l'écran ne peut pas la déduire.
  // Un jury de SEMESTRE ne prononce rien : c'est un bilan intermédiaire, et le
  // calcul ne lui propose aucune décision. Tout ce qui en découle — seuil,
  // propositions, répartition, notification — n'a pas d'objet ici. L'écran les
  // montrait quand même : une colonne « Décision » vide sur vingt-cinq lignes,
  // et un bouton d'émission qui produisait des pièces sans contenu.
  const semestrielle = deliberation.portee === 'semestre';
  // Deuxième année : c'est elle, et elle seule, qui enchaîne rattrapage,
  // concours et PV final. Tant que le référentiel n'a pas répondu, `rang` est
  // indéfini et le PV final reste masqué — mieux vaut un bouton qui apparaît
  // qu'un bouton qui se dérobe sous la main.
  const deuxiemeAnnee =
    niveauxCursus.find(n => n.code === deliberation.niveau)?.rang === 2;

  const decisions = deliberation.decisions_niveau
    ?? DECISIONS_PAR_NIVEAU[deliberation.niveau] ?? [];

  // Le tiroir des éditions, monté selon l'écran : le PV toujours, le détail
  // des notes sur un jury de semestre, le PV final sur un jury annuel arrêté.
  const editions: ActionMenu[] = [
    {
      label: 'PV (PDF)', Icone: FileSignature, enCours: pvPdf.isPending,
      onClick: () => pvPdf.mutate(deliberationId, {
        onSuccess: (b) => downloadBlob(b, `${nomPv}.pdf`), onError: signaler }),
    },
    {
      label: 'PV (Excel)', Icone: Table2, enCours: pvExcel.isPending,
      onClick: () => pvExcel.mutate(deliberationId, {
        onSuccess: (b) => downloadBlob(b, `${nomPv}.xlsx`), onError: signaler }),
    },
  ];

  // Document de séance, complémentaire du PV : celui-ci donne une ligne et une
  // décision par élève, celui-là les notes qui la fondent. Réservé aux jurys de
  // semestre — une délibération annuelle porte deux maquettes, qu'on ne peut
  // pas juxtaposer.
  //
  // Le jury ne parcourt pas toujours la classe de la même façon : par
  // classement pour délibérer du haut vers le bas, par matricule pour retrouver
  // un dossier qu'on lui présente, par numéro d'anonymat pour suivre l'ordre
  // des copies tant qu'elles le restent. L'ordre voyage avec la demande et
  // s'imprime sur le bandeau du document — il est ici porté par l'entrée de
  // menu elle-même, ce qui supprime un menu déroulant de la barre.
  if (semestrielle) {
    for (const [tri, libelle] of [
      ['rang', 'Détail des notes — par classement'],
      ['matricule', 'Détail des notes — par matricule'],
      ['anonymat', 'Détail des notes — par n° d’anonymat'],
    ] as [TriDetailNotes, string][]) {
      editions.push({
        label: libelle, Icone: ListChecks,
        enCours: detailNotes.isPending && detailNotes.variables?.tri === tri,
        onClick: () => detailNotes.mutate({ id: deliberationId, tri }, {
          onSuccess: (b) => downloadBlob(b, `detail-notes-${nomPv}-${tri}.pdf`),
          onError: signaler,
        }),
      });
    }
  }

  // Le PV FINAL réunit tout : la session normale, le rattrapage et le concours.
  // Il ne s'offre que sur le jury ANNUEL, seul à porter la promotion entière,
  // une fois qu'il est arrêté, et SEULEMENT en deuxième année : une première
  // année ne connaît ni rattrapage ni concours, son PV final n'aurait que des
  // colonnes vides à ajouter au PV ordinaire.
  if (verrouillee && deliberation.portee === 'annuelle' && deuxiemeAnnee) {
    editions.push(
      {
        label: 'PV final (PDF)', Icone: FileBadge,
        enCours: pvFinal.isPending && pvFinal.variables?.sortie === 'pdf',
        onClick: () => pvFinal.mutate({ id: deliberationId, sortie: 'pdf' }, {
          onSuccess: (b) => downloadBlob(b, `PV-final-${nomPv}.pdf`),
          onError: signaler }),
      },
      {
        label: 'PV final (Excel)', Icone: Table2,
        enCours: pvFinal.isPending && pvFinal.variables?.sortie === 'excel',
        onClick: () => pvFinal.mutate({ id: deliberationId, sortie: 'excel' }, {
          onSuccess: (b) => downloadBlob(b, `PV-final-${nomPv}.xlsx`),
          onError: signaler }),
      },
    );
  }

  // Ce que la validation fait DÉPEND de la portée, et l'annoncer d'une seule
  // phrase pour les trois était faux deux fois sur trois : un jury de semestre
  // ne fige aucune décision et ne touche à aucun statut — il verrouille les
  // notes de son semestre, rien de plus ; un rattrapage rouvre l'année entière.
  // Le compteur de redoublement, lui, ne bouge que pour les lignes « redoublant »
  // — l'annoncer sans condition faisait craindre un redoublement compté à des
  // étudiants simplement renvoyés au concours.
  const redoublants = stats?.repartition?.[DECISION_REDOUBLANT] ?? 0;
  const messageValidation = semestrielle
    ? 'Un jury de semestre ne prononce aucune décision : la validation '
      + 'verrouille les notes du semestre, et rien d’autre. Aucun statut '
      + 'd’inscription n’est modifié, aucun redoublement compté. '
      + 'Seul un administrateur peut ensuite la dévalider.'
    : (rattrapage
        ? 'La validation fige les décisions de la seconde session, verrouille '
          + 'les notes de l’année — rattrapage compris — et reporte chaque '
          + 'décision sur le statut de l’inscription.'
        : 'La validation fige les décisions, verrouille les notes des deux '
          + 'semestres et reporte chaque décision sur le statut de '
          + 'l’inscription.')
      + (redoublants
          ? ` Le compteur de redoublement sera incrémenté pour ${redoublants} `
            + `étudiant(s).`
          : '')
      + ' Seul un administrateur peut ensuite la dévalider.';

  const emettreDecisions = () => {
    documents.decisionsClasse.mutate(
      { deliberation: deliberationId, classe: classeFiltre ? Number(classeFiltre) : undefined },
      {
        onSuccess: (r) => notifier(
          `${r.emis} décision(s) émise(s)` +
          (r.erreurs.length ? ` — ${r.erreurs.length} en échec` : ''),
        ),
        onError: signaler,
      },
    );
  };

  return (
    <div className="space-y-5">
      <Link href="/dashboard/ipgei/deliberations"
            className="inline-flex items-center gap-1.5 text-sm text-iss-gray hover:text-[#006633] transition-colors">
        <ArrowLeft size={14} /> Toutes les délibérations
      </Link>

      <EnTetePage
        icone={<Scale size={14} className="text-white" />}
        titre={deliberation.libelle
          || `${deliberation.classe_nom || deliberation.niveau} — `
             + `${deliberation.portee === 'semestre' ? deliberation.semestre_code
                  : rattrapage ? 'rattrapage' : 'année'}`}
        sousTitre={
          <>
            {deliberation.annee_universitaire}
            {/* Le seuil ne sert qu'à proposer une décision : sans décision, il
                ne décide de rien et n'a pas à être affiché. */}
            {!semestrielle && ` · seuil ${Number(deliberation.seuil_validation).toFixed(2)}`}
            {!semestrielle && deliberation.plafond_rattrapage &&
              ` · rattrapage plafonné à ${Number(deliberation.plafond_rattrapage).toFixed(2)}`}
            {' · '}
            <Badge ton={verrouillee ? 'vert' : deliberation.statut === 'calculee' ? 'bleu' : 'neutre'}>
              {deliberation.statut_display}
            </Badge>
            {/* Quand le tableau ci-dessous a été établi. L'heure compte : on
                recalcule plusieurs fois dans une séance, et sans elle on ne
                sait pas si l'on regarde l'avant ou l'après-dernier essai. */}
            {' · '}{resumeEtat(deliberation)}
          </>
        }
        actions={
          <>
            {!verrouillee && (
              <div className="inline-flex items-center gap-1.5">
                {/* Le seuil se règle À CÔTÉ du bouton, pas dans un formulaire
                    séparé : on essaie une valeur, on calcule, on lit le
                    résultat — et l'on recommence si besoin. */}
                {!semestrielle && (
                  <>
                    <label className="text-xs text-iss-gray" htmlFor="seuil-essai">
                      Seuil
                    </label>
                    <input
                      id="seuil-essai"
                      value={seuilEssai}
                      onChange={e => setSeuilEssai(e.target.value)}
                      inputMode="decimal"
                      placeholder={Number(deliberation.seuil_validation).toFixed(2)}
                      title="Laisser vide pour garder le seuil actuel"
                      className={INPUT} style={{ width: 68, textAlign: 'center' }}
                    />
                  </>
                )}
                <button onClick={() => calculer.mutate(
                          { id: deliberationId, seuil: seuilEssai.trim() || undefined },
                          {
                            onSuccess: (r) => {
                              setSeuilEssai('');
                              notifier(`${r.lignes} étudiant(s) recalculé(s) au seuil `
                                + `${Number(r.deliberation.seuil_validation).toFixed(2)}`);
                            },
                            onError: signaler,
                          })}
                        disabled={calculer.isPending}
                        className={BTN_SECONDAIRE}>
                  <IconeBouton enCours={calculer.isPending} Icone={Calculator} />
                  {calculer.isPending ? 'Calcul…' : 'Calculer'}
                </button>
              </div>
            )}
            {!verrouillee && deliberation.statut === 'calculee' && (
              <button onClick={() => setAValider(true)} className={BTN_PRIMAIRE} style={{ background: DEGRADE }}>
                <CheckCircle2 size={14} /> Valider le jury
              </button>
            )}
            {/* Les éditions se replient dans un tiroir : elles sont nombreuses
                — jusqu'à cinq sur un jury annuel validé — et aucune n'est
                l'action du moment. Le PV s'édite à tout instant : avant
                validation il sort marqué « projet », ce qui est précisément ce
                dont le jury a besoin en séance. */}
            <MenuActions label="Éditer" Icone={FileSignature} actions={editions} />
            {/* Le second jury s'ouvre depuis le premier : c'est lui qui
                désigne sa cohorte. Le bouton n'apparaît donc que sur un jury
                annuel validé ayant renvoyé quelqu'un au rattrapage — et cède
                la place à un lien dès que ce jury existe. */}
            {verrouillee && deliberation.portee === 'annuelle'
              && deliberation.nb_au_rattrapage > 0 && !deliberation.jury_rattrapage && (
              <button onClick={() => ouvrirRattrapage.mutate(deliberationId, {
                        onSuccess: (jury) => {
                          notifier('Jury de rattrapage ouvert');
                          router.push(`/dashboard/ipgei/deliberations/${jury.id}`);
                        },
                        onError: signaler,
                      })}
                      disabled={ouvrirRattrapage.isPending}
                      className={BTN_PRIMAIRE} style={{ background: DEGRADE }}>
                <IconeBouton enCours={ouvrirRattrapage.isPending} Icone={Repeat} />
                {ouvrirRattrapage.isPending
                  ? 'Ouverture…'
                  : `Ouvrir le jury de rattrapage (${deliberation.nb_au_rattrapage})`}
              </button>
            )}
            {/* La session se saisit ICI, sur le jury qui désigne les
                concernés : toutes les matières de l'année, et la note retenue
                reste le maximum des deux sessions. */}
            {rattrapage && !verrouillee && (
              <Link href={`/dashboard/ipgei/deliberations/${deliberationId}/rattrapage`}
                    className={BTN_PRIMAIRE} style={{ background: DEGRADE }}>
                <Edit3 size={14} /> Saisir les notes de rattrapage
              </Link>
            )}
            {/* Les renvois d'un jury à l'autre ne sont plus ici : le fil du
                parcours, en tête d'écran, les porte tous et dit en plus où
                l'on en est. */}
            {verrouillee && estAdmin && (
              <button onClick={() => setADevalider(true)} className={BTN_SECONDAIRE}>
                <Undo2 size={14} /> Dévalider
              </button>
            )}
            {verrouillee && !semestrielle && (
              <button onClick={emettreDecisions} disabled={documents.decisionsClasse.isPending}
                      className={BTN_PRIMAIRE} style={{ background: DEGRADE }}>
                <IconeBouton enCours={documents.decisionsClasse.isPending} Icone={FileText} />
                {documents.decisionsClasse.isPending
                  ? 'Émission…' : 'Émettre les décisions'}
              </button>
            )}
          </>
        }
      />

      {erreur && <Erreur erreur={new Error(erreur)} />}

      {/* Où l'on en est dans le cursus — cinq actes sur trois écrans. Ne
          s'affiche qu'en deuxième année, seule à en compter cinq. */}
      <FilParcours deliberation={deliberation} />

      {/* Ce que la règle de l'épreuve non rendue va coûter, AVANT de valider.
          C'est le piège qui a fait passer une promotion entière sous le seuil
          sur un semestre non saisi, sans qu'aucun écran ne le dise. */}
      {stats && stats.lacunes?.length > 0 && (
        <BandeauLacunes lacunes={stats.lacunes}
                        vides={stats.matieres_vides}
                        verrouillee={verrouillee} />
      )}

      {/* Le fait d'abord, sa portée ensuite : qui a validé et quand se lit d'un
          coup d'œil, et la conséquence — notes verrouillées, statuts posés —
          vient sur sa propre ligne au lieu de prolonger la phrase. */}
      {verrouillee && (
        <div className={`${CARTE} px-4 py-3 flex items-start gap-2.5`}
             style={{ borderLeft: '3px solid #006633' }}>
          <Lock size={15} className="text-[#006633] shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-iss-dark">
              Jury validé
              {deliberation.validee_par_nom && ` par ${deliberation.validee_par_nom}`}
              {deliberation.date_validation
                && ` le ${formatDateTime(deliberation.date_validation)}`}
            </p>
            <p className="text-xs text-iss-gray mt-0.5">
              {semestrielle
                ? 'Les notes du semestre sont verrouillées. Un jury de semestre'
                  + ' ne modifie aucun statut d’inscription : le passage se'
                  + ' prononce au jury annuel.'
                : 'Les notes concernées sont verrouillées et les décisions sont'
                  + ' reportées sur les inscriptions.'}
            </p>
          </div>
        </div>
      )}

      {verrouillee && deliberation.portee === 'annuelle' && (
        <SectionPassage
          deliberationId={deliberationId}
          // Ce que le jury a laissé EN SUSPENS. Sans ces deux nombres, un jury
          // de deuxième année annonçait « aucun étudiant ne repart » là où neuf
          // attendaient simplement le rattrapage et le concours.
          enSuspens={{
            rattrapage: stats?.repartition?.[DECISION_RATTRAPAGE] ?? 0,
            concours:   stats?.repartition?.[DECISION_CNIM] ?? 0,
          }}
          onNotifier={notifier}
          onErreur={signaler}
        />
      )}

      {stats && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Tuile label="Effectif" valeur={stats.effectif}
                 detail={`${stats.notes_saisies} avec moyenne`} />
          <Tuile label={deliberation.classe ? 'Moyenne de la classe' : 'Moyenne de promotion'}
                 valeur={fmtNote(stats.moyenne_promo)} />
          <Tuile label="Meilleure moyenne" valeur={fmtNote(stats.meilleure)} />
          <Tuile label={etatDeliberation(deliberation).libelle}
                 valeur={etatDeliberation(deliberation).date || '—'} />
        </div>
      )}

      {!semestrielle && stats && Object.keys(stats.repartition).length > 0 && (
        <div className={`${CARTE} p-4 flex flex-wrap gap-2`}>
          <span className="text-xs font-bold text-iss-gray uppercase tracking-wide self-center mr-1">
            Répartition
          </span>
          {Object.entries(stats.repartition).map(([cle, nombre]) => (
            <Badge key={cle} ton={tonDecision(cle)}>
              {decisions.find(d => d.value === cle)?.label ?? 'Sans décision'} : {nombre}
            </Badge>
          ))}
        </div>
      )}

      {/* Le filtre de classe ne s'affiche que pour les jurys tenus AVANT que
          la délibération ne soit rattachée à une classe : eux couvrent tout un
          niveau. Sur un jury de classe, il n'aurait qu'une valeur possible. */}
      {!deliberation.classe && (
        <div className="flex gap-2 flex-wrap">
          <select value={classeFiltre} onChange={e => setClasseFiltre(e.target.value)}
                  className={SELECT} style={{ width: 200 }}>
            <option value="">Toutes les classes du niveau</option>
            {classesDuNiveau.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
          </select>
        </div>
      )}

      <div className={`${CARTE} overflow-hidden`}>
        {chargeLignes ? <Chargement /> : lignes.length === 0 ? (
          <Vide texte="Aucune ligne — lancez le calcul pour établir les résultats du jury." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                {/* En-têtes centrés : les colonnes sont de largeurs très
                    inégales — un rang tient sur deux caractères, un motif sur
                    une phrase —, et des titres calés à gauche se retrouvaient
                    loin de la colonne qu'ils nommaient. */}
                <tr className="text-center text-xs font-semibold text-iss-gray uppercase tracking-wide border-b border-gray-100">
                  {/* Les mêmes colonnes que le PV : sur un jury de semestre, la
                      colonne « Rang » du jury répéterait le rang de classe. */}
                  {!semestrielle && <th className="px-4 py-3 w-14">Rang</th>}
                  <th className="px-4 py-3">Étudiant</th>
                  {!deliberation.classe && <th className="px-4 py-3">Classe</th>}
                  <th className="px-4 py-3">Moyenne</th>
                  {semestrielle && <>
                    <th className="px-4 py-3">Rang sur la classe</th>
                    <th className="px-4 py-3">Rang sur la promotion</th>
                  </>}
                  {!semestrielle && <>
                    <th className="px-4 py-3">Proposition</th>
                    <th className="px-4 py-3"
                        title="Ce que le jury a prononcé ce jour-là. Cette décision ne bouge plus.">
                      Décision du jury
                    </th>
                    <th className="px-4 py-3">Motif si dérogation</th>
                    {/* Ce que l'étudiant est DEVENU. La décision ci-contre est
                        datée du jour du jury et ne bouge plus ; sans ce
                        rappel, un jury annuel semble en retard sur la réalité
                        — « autorisé au rattrapage » pour quelqu'un qui est
                        redoublant depuis. */}
                    <th className="px-4 py-3"
                        title="Ce que l'étudiant est devenu depuis, après le rattrapage et le concours.">
                      Situation actuelle
                    </th>
                  </>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {lignes.map(ligne => (
                  <LigneJury
                    key={ligne.id} ligne={ligne}
                    decisions={decisions}
                    verrouillee={verrouillee}
                    semestrielle={semestrielle}
                    afficherClasse={!deliberation.classe}
                    seuil={Number(deliberation.seuil_validation)}
                    onAjuster={ajusterLigne}
                    onNotifier={notifier}
                    onErreur={signaler}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
        {/* La distinction ne se devine pas, et c'est elle qu'on est venu
            chercher quand un statut « ne bouge pas » : la décision est datée
            du jury, la situation vit après lui. */}
        {/* Deux définitions, deux lignes : en un seul paragraphe, l'œil ne
            distinguait pas ce qui définissait la décision de ce qui définissait
            la situation — or c'est justement leur différence qu'on vient
            chercher. */}
        {!semestrielle && lignes.length > 0 && (
          <dl className="px-5 py-3 border-t border-gray-100 text-xs space-y-1">
            <div className="flex gap-2">
              <dt className="font-semibold text-iss-dark shrink-0 w-20">Décision</dt>
              <dd className="text-iss-gray">
                celle prononcée le jour du jury — elle est figée.
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="font-semibold text-iss-dark shrink-0 w-20">Situation</dt>
              <dd className="text-iss-gray">
                ce que l&apos;étudiant est devenu depuis — rattrapage, concours,
                application des résultats. Rappelée seulement lorsqu&apos;elle
                diffère de la décision.
              </dd>
            </div>
          </dl>
        )}
      </div>

      <SectionJury
        deliberationId={deliberationId}
        validee={verrouillee}
        onNotifier={notifier}
        onErreur={signaler}
      />

      <ConfirmModal
        open={aValider}
        title="Valider la délibération"
        message={messageValidation}
        confirmLabel="Valider le jury"
        variant="success"
        onConfirm={() => valider.mutate(deliberationId, {
          onSuccess: () => { setAValider(false); notifier('Délibération validée'); },
          onError:   (e) => { setAValider(false); signaler(e); },
        })}
        onCancel={() => setAValider(false)}
        loading={valider.isPending}
      />

      <ConfirmModal
        open={aDevalider}
        title="Dévalider la délibération"
        message={
          'Les inscriptions retrouvent le statut et le compteur de redoublement '
          + "qu'elles avaient avant ce jury, et les notes se déverrouillent — sauf "
          + 'celles qu’un autre jury validé couvre encore. La délibération repasse '
          + 'en « calculée » : ses moyennes et ses décisions restent.'
          + (deliberation.nb_decisions_emises
             ? ` ⚠ ${deliberation.nb_decisions_emises} décision(s) ont déjà été `
               + 'éditées et vérifiables en ligne : elles resteront dans la nature.'
             : '')
        }
        confirmLabel="Dévalider"
        variant="danger"
        onConfirm={() => devalider.mutate(deliberationId, {
          onSuccess: () => { setADevalider(false); notifier('Délibération dévalidée'); },
          onError:   (e) => { setADevalider(false); signaler(e); },
        })}
        onCancel={() => setADevalider(false)}
        loading={devalider.isPending}
      />

      <Toast message={toast} />
    </div>
  );
}

/**
 * Ce que le jury s'apprête à compter ZÉRO.
 *
 * La règle de l'épreuve non rendue est juste — une matière non composée vaut
 * zéro avec son coefficient — mais elle est silencieuse : une matière jamais
 * saisie n'a pas de ligne de note, elle n'apparaît nulle part et pèse quand
 * même. Un semestre oublié fait passer une promotion entière sous le seuil, et
 * le jury ne s'en aperçoit qu'aux moyennes.
 *
 * Ce bandeau n'interdit rien : délibérer sur une matière non rendue est
 * parfaitement légitime. Il exige seulement qu'on le sache.
 */
function BandeauLacunes({ lacunes, vides, verrouillee }: {
  lacunes:     LacuneDeliberation[];
  vides:       number;
  verrouillee: boolean;
}) {
  const [deplie, setDeplie] = useState(false);
  // Une matière que PERSONNE n'a passée est un oubli de saisie neuf fois sur
  // dix ; un absent isolé est un cas d'espèce. Les deux ne s'alertent pas de la
  // même façon.
  const grave = vides > 0 && !verrouillee;
  const couleur = grave ? '#b45309' : '#64748b';

  return (
    <div className={`${CARTE} px-4 py-3 space-y-2`}
         style={{ borderLeft: `3px solid ${couleur}` }}>
      <div className="flex items-start gap-2 flex-wrap">
        <AlertTriangle size={15} className="mt-0.5 shrink-0" style={{ color: couleur }} />
        <p className="text-xs text-iss-dark flex-1 min-w-[260px]">
          <b>
            {vides > 0
              ? `${vides} matière(s) sans aucune note`
              : `${lacunes.length} matière(s) incomplète(s)`}
          </b>
          {' — '}
          {verrouillee
            ? 'elles ont compté zéro, avec leur coefficient, dans les moyennes de ce jury.'
            : 'elles compteront ZÉRO, avec leur coefficient, pour les étudiants concernés. '
              + 'Vérifiez la saisie avant de valider.'}
        </p>
        <button type="button" onClick={() => setDeplie(d => !d)}
                className="text-xs font-medium text-[#006633] hover:underline shrink-0">
          {deplie ? 'Masquer le détail' : 'Voir le détail'}
        </button>
      </div>

      {deplie && (
        <ul className="flex flex-wrap gap-1.5 pt-0.5">
          {lacunes.map(lacune => (
            <li key={`${lacune.semestre}-${lacune.matiere}`}
                className="inline-flex items-center gap-1.5 rounded-lg border
                           border-gray-200 px-2 py-1 text-xs">
              <b className="text-iss-dark">{lacune.semestre}</b>
              <span className="text-iss-dark">{lacune.intitule}</span>
              <span className="text-iss-gray">coef. {fmtCoef(lacune.coefficient)}</span>
              <span className={lacune.totale ? 'text-amber-700 font-semibold' : 'text-iss-gray'}>
                {lacune.totale
                  ? `aucune note sur ${lacune.effectif}`
                  : `${lacune.manquants} / ${lacune.effectif} sans note`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const ROLES: { value: RoleJuryIPGEI; label: string }[] = [
  { value: 'president',  label: 'Président du jury' },
  { value: 'directeur',  label: 'Directeur des études' },
  { value: 'enseignant', label: 'Enseignant' },
  { value: 'secretaire', label: 'Secrétaire de séance' },
];

/**
 * Composition du jury et signatures du PV.
 *
 * Une délibération est un acte collégial : sans membres désignés, le PV sort
 * avec la seule signature de l'établissement. La signature n'est ouverte
 * qu'après validation — signer un projet reviendrait à approuver ce qui peut
 * encore changer.
 */
/**
 * Passage en année supérieure.
 *
 * Le jury prononce, le passage exécute : il ouvre l'année suivante aux
 * étudiants admis, dans la CLASSE D'ATTENTE du niveau visé — à ce moment on
 * ignore encore combien de classes ouvrir. L'écran « Affectation aux classes »
 * les répartit ensuite.
 *
 * Rejouable sans risque : un étudiant déjà inscrit sur l'année cible est
 * compté et laissé tel quel. C'est ce qui permet de relancer après avoir
 * corrigé un cas, sans redouter les doublons.
 */
function SectionPassage({ deliberationId, enSuspens, onNotifier, onErreur }: {
  deliberationId: number;
  /** Combien de lignes attendent encore le rattrapage, et combien le concours. */
  enSuspens:      { rattrapage: number; concours: number };
  onNotifier:     (m: string) => void;
  onErreur:       (e: unknown) => void;
}) {
  const { data: apercu, isLoading } = useApercuPassage(deliberationId);
  const { passage } = useDeliberationMutations();
  const [bilan, setBilan] = useState<BilanPassage | null>(null);

  if (isLoading || !apercu) return null;

  const candidats = apercu.candidats;
  const restants  = candidats.filter(c => !c.deja_inscrit);
  // Plusieurs niveaux partagent parfois le rang visé — MP et un éventuel autre
  // second cycle. Le serveur refuse alors de deviner ; l'écran doit trancher.
  const ambigus = restants.filter(c => c.niveaux.length > 1);
  const niveaux = [...new Set(restants.flatMap(c => c.niveaux))];

  if (candidats.length === 0) {
    // Deux vides qu'il ne faut surtout pas confondre. Le premier est un
    // ACHÈVEMENT : le jury s'est prononcé, et personne ne repart. Le second est
    // une ATTENTE : les décisions prises n'ouvrent pas la suite, elles ouvrent
    // une étape de plus, et le passage se remplira quand le rattrapage et le
    // concours auront parlé. Les annoncer de la même façon laissait croire une
    // promotion sans avenir là où neuf dossiers étaient simplement en cours.
    const attendus = enSuspens.rattrapage + enSuspens.concours;
    const teinte = attendus ? '#0369a1' : '#d97706';

    return (
      <div className={`${CARTE} p-4 space-y-2`}
           style={{ borderLeft: `3px solid ${teinte}` }}>
        <div className="flex items-center gap-2 flex-wrap">
          {attendus
            ? <Hourglass size={15} className="text-sky-700 shrink-0" />
            : <Info size={15} className="text-amber-600 shrink-0" />}
          <h2 className="text-sm font-bold text-iss-dark">
            Passage en {apercu.annee_cible}
          </h2>
          {attendus > 0 && (
            <>
              {enSuspens.rattrapage > 0 && (
                <Badge ton="ambre">{enSuspens.rattrapage} au rattrapage</Badge>
              )}
              {enSuspens.concours > 0 && (
                <Badge ton="bleu">{enSuspens.concours} au concours</Badge>
              )}
            </>
          )}
        </div>
        <p className="text-xs text-iss-gray">
          {attendus > 0 ? (
            <>
              Personne ne repart <b className="text-iss-dark">encore</b> :
              les décisions de ce jury ouvrent une étape de plus.
              {' '}Le passage s&apos;ouvrira une fois {attendus > 1
                ? 'ces situations connues' : 'cette situation connue'} —
              après le jury de rattrapage, puis la saisie du résultat du
              concours et l&apos;application des situations.
            </>
          ) : (
            <>
              Aucun étudiant ne repart : le jury n&apos;a prononcé ni admission
              ni redoublement.
            </>
          )}
        </p>
      </div>
    );
  }

  return (
    <div className={`${CARTE} p-4 space-y-3`} style={{ borderLeft: '3px solid #006633' }}>
      <div className="flex items-center gap-2 flex-wrap">
        <ArrowUpCircle size={15} className="text-[#006633]" />
        <h2 className="text-sm font-bold text-iss-dark">
          Passage en {apercu.annee_cible}
        </h2>
        <Badge ton="bleu">{restants.length} à inscrire</Badge>
        {candidats.length !== restants.length && (
          <Badge ton="vert">
            {candidats.length - restants.length} déjà inscrit(s)
          </Badge>
        )}
        <button
          onClick={() => passage.mutate(
            { id: deliberationId, niveau: niveaux.length === 1 ? niveaux[0] : undefined },
            {
              onSuccess: (r) => {
                setBilan(r);
                onNotifier(`${r.inscriptions} inscription(s) ouverte(s) en ${r.annee_cible}`);
              },
              onError: onErreur,
            },
          )}
          disabled={passage.isPending || restants.length === 0 || ambigus.length > 0}
          className={`${BTN_PRIMAIRE} ml-auto`} style={{ background: DEGRADE }}>
          <IconeBouton enCours={passage.isPending} Icone={ArrowUpCircle} />
          {passage.isPending ? 'Inscription…' : `Inscrire en ${apercu.annee_cible}`}
        </button>
      </div>

      <p className="text-xs text-iss-gray">
        Les inscriptions s&apos;ouvrent dans la classe d&apos;attente
        {niveaux.length === 1 ? ` de ${niveaux[0]}` : ' du niveau visé'} : à ce
        moment on ignore encore combien de classes ouvrir.{' '}
        <Link href="/dashboard/ipgei/inscriptions/affectation"
              className="text-[#006633] font-medium hover:underline">
          Affectation aux classes
        </Link>{' '}
        les répartit ensuite. Notes et absences de l&apos;année écoulée restent
        intactes.
      </p>

      {/* Qui repart, nommément. Le compte seul ne se vérifie pas : après un
          rattrapage et un concours, l'utilisateur veut retrouver SES cas avant
          d'ouvrir des inscriptions qui comptent un redoublement. */}
      <ul className="flex flex-wrap gap-1.5">
        {candidats.map(candidat => (
          <li key={candidat.inscription}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs
                ${candidat.deja_inscrit
                  ? 'border-gray-100 text-iss-gray'
                  : 'border-gray-200 text-iss-dark'}`}>
            <b className="font-semibold">{candidat.etudiant_matricule}</b>
            <span className={candidat.deja_inscrit ? '' : 'text-iss-gray'}>
              {candidat.etudiant_nom}
            </span>
            <span className={candidat.suite === 'monte'
                             ? 'text-[#006633]' : 'text-amber-700'}>
              {candidat.suite === 'monte' ? 'monte' : 'redouble'}
              {candidat.niveaux.length === 1 && ` en ${candidat.niveaux[0]}`}
            </span>
            {candidat.deja_inscrit && <span>· déjà inscrit</span>}
          </li>
        ))}
      </ul>

      {ambigus.length > 0 && (
        <p className="text-xs text-amber-700">
          {ambigus.length} étudiant(s) peuvent viser plusieurs niveaux
          ({[...new Set(ambigus.flatMap(c => c.niveaux))].join(', ')}) : le
          passage automatique ne devine pas lequel.
        </p>
      )}

      {bilan && (
        <div className="text-xs text-iss-gray space-y-1 border-t border-gray-100 pt-2">
          <p>
            <b className="text-iss-dark">{bilan.inscriptions}</b> inscription(s)
            ouverte(s) en {bilan.annee_cible}
            {bilan.deja_inscrits > 0 && `, ${bilan.deja_inscrits} déjà inscrit(s)`}.
          </p>
          {/* Ouvrir l'année est un acte discret — un libellé, sans dates ni
              tarif — mais il ne doit pas être silencieux : c'est en la
              découvrant après coup qu'on se demande d'où elle sort. */}
          {bilan.annee_ouverte && (
            <p className="text-amber-700">
              L&apos;année {bilan.annee_cible} vient d&apos;être ouverte au
              registre. Complétez ses dates et sa grille tarifaire dans{' '}
              <Link href="/dashboard/parametres/annees"
                    className="font-medium hover:underline">
                Paramètres → Années
              </Link>.
            </p>
          )}
          {bilan.sans_tarif > 0 && (
            <p className="text-amber-700">
              {bilan.sans_tarif} inscription(s) à 0 : la grille tarifaire de{' '}
              {bilan.annee_cible} n&apos;est pas renseignée.
            </p>
          )}
          {bilan.refuses.map(r => (
            <p key={r.etudiant} className="text-red-600">
              {r.etudiant} : {r.motif}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function SectionJury({ deliberationId, validee, onNotifier, onErreur }: {
  deliberationId: number;
  validee:        boolean;
  onNotifier:     (m: string) => void;
  onErreur:       (e: unknown) => void;
}) {
  const { data: membres = [], isLoading } = useMembresJury(deliberationId);
  const { ajouter, retirer, signer } = useJuryMutations(deliberationId);
  const [utilisateur, setUtilisateur] = useState('');
  // La recherche part au SERVEUR : la liste des candidats se cherche, elle ne
  // se déroule pas. Un menu déroulant tronqué à la première page cachait les
  // enseignants au-delà du vingtième, sans rien annoncer.
  const [recherche, setRecherche] = useState('');
  const { data: candidats = [], isFetching: chargeCandidats } =
    useCandidatsJury(deliberationId, recherche);
  const [role, setRole] = useState<RoleJuryIPGEI>('enseignant');
  // Quel membre est en cours de retrait : la mutation est partagée par toutes
  // les cartes, son `isPending` seul les ferait toutes tourner à la fois.
  const [retraitEnCours, setRetraitEnCours] = useState<number | null>(null);

  const moi = getStoredUser();
  const maPlace = membres.find(m => m.utilisateur === moi?.id);
  // Le serveur écarte déjà les étudiants — un jury juge des étudiants, aucun
  // n'y siège — et ceux qui siègent déjà. Le rôle passe en second plan plutôt
  // qu'accolé au nom : c'est ce qui distingue deux homonymes, pas ce qu'on
  // cherche des yeux.
  const propositions = candidats.map(c => ({
    id: String(c.id), label: c.nom, detail: c.role_display,
  }));

  return (
    <div className={`${CARTE} p-4 space-y-3`}>
      <div className="flex items-center gap-2 flex-wrap">
        <Users size={15} className="text-[#006633]" />
        <h2 className="text-sm font-bold text-iss-dark">Jury et signatures du procès-verbal</h2>
        <Badge ton={membres.length && membres.every(m => m.a_signe) ? 'vert' : 'neutre'}>
          {membres.filter(m => m.a_signe).length} / {membres.length} signature(s)
        </Badge>
        {maPlace && !maPlace.a_signe && validee && (
          <button onClick={() => signer.mutate(deliberationId, {
                    onSuccess: () => onNotifier('Procès-verbal signé'),
                    onError: onErreur,
                  })}
                  disabled={signer.isPending}
                  className={`${BTN_PRIMAIRE} ml-auto`} style={{ background: DEGRADE }}>
            <IconeBouton enCours={signer.isPending} Icone={FileSignature} taille={13} />
            {signer.isPending ? 'Signature…' : 'Signer le PV'}
          </button>
        )}
      </div>

      {isLoading ? <Chargement texte="Lecture du jury…" /> : membres.length === 0 ? (
        <p className="text-xs text-iss-gray">
          Aucun membre désigné : le procès-verbal sortira sans signataire.
        </p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {membres.map(membre => (
            <div key={membre.id} className="rounded-xl border border-gray-100 p-3">
              <p className="text-[11px] text-iss-gray">{membre.role_display}</p>
              <p className="text-sm font-semibold text-iss-dark">{membre.utilisateur_nom}</p>
              <div className="flex items-center justify-between mt-1.5">
                {membre.a_signe ? (
                  <span className="text-[11px] font-semibold text-emerald-700">
                    Signé le {membre.signature_le?.slice(0, 10)}
                  </span>
                ) : (
                  <span className="text-[11px] text-iss-gray">En attente de signature</span>
                )}
                {/* Un signataire ne se retire pas : sa signature disparaîtrait
                    avec lui. Le bouton n'apparaît donc pas. */}
                {!membre.a_signe && (
                  <button onClick={() => {
                            setRetraitEnCours(membre.id);
                            retirer.mutate(membre.id, {
                              onSuccess: () => onNotifier('Membre retiré du jury'),
                              onError:   onErreur,
                              onSettled: () => setRetraitEnCours(null),
                            });
                          }}
                          disabled={retirer.isPending}
                          title="Retirer du jury"
                          className="p-1 rounded-md text-iss-gray hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-50">
                    <IconeBouton enCours={retraitEnCours === membre.id} Icone={X} taille={13} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2 flex-wrap pt-1">
        <div style={{ width: 300 }}>
          <ChampRecherche value={utilisateur}
                          propositions={propositions}
                          onChange={setUtilisateur}
                          onSaisie={setRecherche}
                          chargement={chargeCandidats}
                          placeholder="Rechercher un membre…"
                          vide="Aucun compte ne correspond" />
        </div>
        <select value={role} onChange={e => setRole(e.target.value as RoleJuryIPGEI)}
                className={SELECT} style={{ width: 200 }}>
          {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
        <button onClick={() => {
                  if (!utilisateur) return;
                  ajouter.mutate(
                    { deliberation: deliberationId, utilisateur: Number(utilisateur), role },
                    {
                      onSuccess: () => { setUtilisateur(''); onNotifier('Membre ajouté au jury'); },
                      onError: onErreur,
                    },
                  );
                }}
                disabled={!utilisateur || ajouter.isPending} className={BTN_SECONDAIRE}>
          <IconeBouton enCours={ajouter.isPending} Icone={UserPlus} taille={13} />
          {ajouter.isPending ? 'Ajout…' : 'Ajouter'}
        </button>
      </div>
    </div>
  );
}

function LigneJury({
  ligne, decisions, verrouillee, semestrielle, afficherClasse,
  seuil, onAjuster, onNotifier, onErreur,
}: {
  ligne: LigneDeliberation;
  decisions: { value: string; label: string }[];
  verrouillee: boolean;
  /** Jury de semestre : la ligne s'arrête à la moyenne, rien ne s'y décide. */
  semestrielle: boolean;
  /** Faux sur un jury de classe : la colonne y répéterait la même valeur. */
  afficherClasse: boolean;
  seuil: number;
  onAjuster: { mutate: (v: never, o?: object) => void; isPending: boolean };
  onNotifier: (m: string) => void;
  onErreur: (e: unknown) => void;
}) {
  const [motif, setMotif] = useState(ligne.motif_ajustement);
  const moyenne = ligne.moyenne_generale != null ? Number(ligne.moyenne_generale) : null;
  const sousSeuil = moyenne != null && moyenne < seuil;

  const changerDecision = (decision: string) => {
    onAjuster.mutate({ id: ligne.id, input: { decision, motif_ajustement: motif } } as never, {
      onSuccess: () => onNotifier('Décision enregistrée'),
      onError:   onErreur,
    });
  };

  const enregistrerMotif = () => {
    if (motif === ligne.motif_ajustement) return;
    onAjuster.mutate({ id: ligne.id, input: { motif_ajustement: motif } } as never, {
      onSuccess: () => onNotifier('Motif enregistré'),
      onError:   onErreur,
    });
  };

  return (
    <tr className="hover:bg-gray-50/60">
      {!semestrielle && (
        <td className="px-4 py-3 text-center font-bold text-iss-gray">{ligne.rang ?? '—'}</td>
      )}
      <td className="px-4 py-3">
        <div className="font-semibold text-iss-dark whitespace-nowrap">{ligne.etudiant_nom}</div>
        <div className="text-xs text-iss-gray">
          {ligne.etudiant_matricule}
          {ligne.nb_redoublements > 0 && ` · ${ligne.nb_redoublements} redoublement(s)`}
        </div>
      </td>
      {afficherClasse && (
        <td className="px-4 py-3 text-iss-gray whitespace-nowrap">{ligne.classe_nom}</td>
      )}
      <td className={`px-4 py-3 text-center font-bold ${sousSeuil ? 'text-red-600' : 'text-[#006633]'}`}>
        {fmtNote(ligne.moyenne_generale)}
      </td>
      {semestrielle && <>
        {/* « 17 / 25 » : un rang ne se lit pas sans son effectif. */}
        <td className="px-4 py-3 text-center tabular-nums">
          {ligne.rang_classe ?? '—'}
          {ligne.rang_classe && ligne.effectif_classe
            ? <span className="text-iss-gray"> / {ligne.effectif_classe}</span> : null}
        </td>
        <td className="px-4 py-3 text-center tabular-nums font-semibold">
          {ligne.rang_promotion ?? '—'}
          {ligne.rang_promotion && ligne.effectif_promotion
            ? <span className="text-iss-gray font-normal"> / {ligne.effectif_promotion}</span> : null}
        </td>
      </>}
      {semestrielle ? null : <>
      <td className="px-4 py-3">
        {ligne.decision_auto ? (
          <Badge ton={tonDecision(ligne.decision_auto)}>{ligne.decision_auto_display}</Badge>
        ) : ligne.motif_sans_proposition ? (
          <span className="text-xs text-iss-gray leading-snug block max-w-[240px]"
                title={ligne.motif_sans_proposition}>
            {ligne.motif_sans_proposition}
          </span>
        ) : (
          <span className="text-xs text-iss-gray">—</span>
        )}
      </td>
      <td className="px-4 py-3">
        {verrouillee ? (
          <Badge ton={tonDecision(ligne.decision)}>{ligne.decision_display || '—'}</Badge>
        ) : (
          <select value={ligne.decision} className={SELECT} style={{ minWidth: 170 }}
                  onChange={e => changerDecision(e.target.value)}>
            <option value="">Sans décision</option>
            {decisions.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
          </select>
        )}
      </td>
      <td className="px-4 py-3">
        {/* Le champ n'apparaissait qu'une fois la décision déjà écartée de la
            proposition. Or c'est AVANT de trancher qu'on écrit pourquoi : il
            fallait changer la décision, attendre le serveur, puis revenir sur
            la ligne pour justifier. Il est désormais toujours saisissable tant
            que le jury n'est pas validé. */}
        {verrouillee ? (
          <span className="text-xs text-iss-gray italic">{ligne.motif_ajustement || '—'}</span>
        ) : (
          <input value={motif} onChange={e => setMotif(e.target.value)} onBlur={enregistrerMotif}
                 placeholder={ligne.est_ajustee ? 'Motif obligatoire' : 'Motif si dérogation'}
                 title="Enregistré en quittant le champ"
                 className={INPUT} style={{ minWidth: 180 }} />
        )}
      </td>
      <td className="px-4 py-3">
        {/* Affichée seulement quand elle DIFFÈRE de la décision : la répéter
            sur chaque ligne noierait le seul cas qui compte. */}
        {/* « depuis » tout seul ne disait rien : deux étudiants finissent
            redoublants par des chemins opposés — recalé au rattrapage, ou
            recalé au concours —, et c'est précisément ce qu'on cherche en
            lisant cette colonne. Le serveur tranche, l'écran nomme. */}
        {ligne.statut_actuel !== ligne.decision ? (
          <span className="inline-flex items-center gap-1.5 flex-wrap">
            <Badge ton={tonDecision(ligne.statut_actuel)}>
              {ligne.statut_actuel_display}
            </Badge>
            <span className="text-[11px] text-iss-gray">
              {ORIGINE_SITUATION[ligne.origine_situation ?? ''] ?? 'aujourd’hui'}
            </span>
          </span>
        ) : (
          <span className="text-xs text-iss-gray">conforme</span>
        )}
      </td>
      {/* Plus de colonne d'actions : les décisions s'éditent EN LOT depuis
          « Émettre les décisions », en tête d'écran, et les attestations CNIM
          depuis Documents → Lot. Un bouton par ligne invitait à produire les
          pièces une à une — chacune avec son propre numéro au registre. */}
      </>}
    </tr>
  );
}
