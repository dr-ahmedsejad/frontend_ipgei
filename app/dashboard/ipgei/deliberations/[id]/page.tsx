'use client';

import { use, useState } from 'react';

import type { TriDetailNotes } from '@/lib/api/ipgei';
import Link from 'next/link';
import {
  ArrowLeft, ArrowUpCircle, Calculator, CheckCircle2, FileBadge, FileSignature,
  FileText, ListChecks, Loader2, Lock, Scale, Table2, Undo2, UserPlus, Users, X,
} from 'lucide-react';

import { ConfirmModal } from '@/components/ConfirmModal';
import {
  BTN_PRIMAIRE, BTN_SECONDAIRE, Badge, CARTE, Chargement, DEGRADE, EnTetePage,
  Erreur, INPUT, SELECT, Toast, Tuile, Vide, fmtNote, tonDecision,
} from '../../_ui';
import {
  useApercuPassage, useClassesSelect, useDeliberation, useDeliberationMutations,
  useDocumentMutations, useJuryMutations, useLignesDeliberation, useMembresJury,
  useStatistiquesDeliberation,
} from '@/lib/api/ipgei-hooks';
import { useComptesList } from '@/lib/api/comptes-hooks';
import { etatDeliberation, resumeEtat } from '../_etat';
import { formatDateTime } from '@/lib/formatters';
import { getStoredUser } from '@/lib/auth';
import { downloadBlob } from '@/lib/downloadBlob';
import {
  DECISIONS_PAR_NIVEAU, type BilanPassage, type LigneDeliberation,
  type RoleJuryIPGEI,
} from '@/types/ipgei';

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

  const [classeFiltre, setClasseFiltre] = useState('');
  const [toast, setToast]   = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [aValider, setAValider] = useState(false);
  const [aDevalider, setADevalider] = useState(false);
  const [triDetail, setTriDetail] = useState<TriDetailNotes>('rang');
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

  const { calculer, valider, devalider, ajusterLigne, pvPdf, pvExcel, detailNotes } =
    useDeliberationMutations();
  const documents = useDocumentMutations();

  if (isLoading || !deliberation) return <Chargement />;

  const verrouillee = deliberation.est_verrouillee;
  const nomPv = `PV-${deliberation.niveau}-`
    + `${deliberation.portee === 'semestre' ? deliberation.semestre_code : 'annuel'}-`
    + deliberation.annee_universitaire;
  const classesDuNiveau = classes.filter(c => c.niveau === deliberation.niveau);
  // La liste vient du serveur : un code de niveau seul ne dit pas s'il s'agit
  // d'une 1re ou d'une 2e année, donc l'écran ne peut pas la déduire.
  const decisions = deliberation.decisions_niveau
    ?? DECISIONS_PAR_NIVEAU[deliberation.niveau] ?? [];

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
             + `${deliberation.portee === 'semestre' ? deliberation.semestre_code : 'année'}`}
        sousTitre={
          <>
            {deliberation.annee_universitaire} · seuil {Number(deliberation.seuil_validation).toFixed(2)}
            {deliberation.plafond_rattrapage &&
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
            {/* Le PV s'édite à tout moment : avant validation il sort marqué
                « projet », ce qui est précisément ce dont le jury a besoin en
                séance. */}
            <button onClick={() => pvPdf.mutate(deliberationId, {
                      onSuccess: (b) => downloadBlob(b, `${nomPv}.pdf`),
                      onError: signaler,
                    })}
                    disabled={pvPdf.isPending} className={BTN_SECONDAIRE}>
              <IconeBouton enCours={pvPdf.isPending} Icone={FileSignature} />
              {pvPdf.isPending ? 'Édition…' : 'PV (PDF)'}
            </button>
            <button onClick={() => pvExcel.mutate(deliberationId, {
                      onSuccess: (b) => downloadBlob(b, `${nomPv}.xlsx`),
                      onError: signaler,
                    })}
                    disabled={pvExcel.isPending} className={BTN_SECONDAIRE}>
              <IconeBouton enCours={pvExcel.isPending} Icone={Table2} />
              {pvExcel.isPending ? 'Édition…' : 'PV (Excel)'}
            </button>
            {/* Document de séance, complémentaire du PV : celui-ci donne une
                ligne et une décision par élève, celui-là les notes qui la
                fondent. Réservé aux jurys de semestre — une délibération
                annuelle porte deux maquettes, qu'on ne peut pas juxtaposer. */}
            {deliberation.portee === 'semestre' && (
              /* Le jury ne parcourt pas toujours la classe de la même
                 façon : par classement pour délibérer du haut vers le bas, par
                 matricule pour retrouver un dossier qu'on lui présente, par
                 moyenne pour examiner les cas limites. L'ordre voyage avec la
                 demande, et s'imprime sur le bandeau du document. */
              <div className="inline-flex items-center gap-1.5">
                <select value={triDetail} className={SELECT} style={{ width: 132 }}
                        onChange={e => setTriDetail(e.target.value as TriDetailNotes)}>
                  <option value="rang">Par classement</option>
                  <option value="matricule">Par matricule</option>
                  <option value="moyenne">Par moyenne</option>
                </select>
                <button onClick={() => detailNotes.mutate(
                          { id: deliberationId, tri: triDetail },
                          {
                            onSuccess: (b) => downloadBlob(b, `detail-notes-${nomPv}-${triDetail}.pdf`),
                            onError: signaler,
                          })}
                        disabled={detailNotes.isPending} className={BTN_SECONDAIRE}>
                  <IconeBouton enCours={detailNotes.isPending} Icone={ListChecks} />
                  {detailNotes.isPending ? 'Édition…' : 'Détail des notes'}
                </button>
              </div>
            )}
            {verrouillee && estAdmin && (
              <button onClick={() => setADevalider(true)} className={BTN_SECONDAIRE}>
                <Undo2 size={14} /> Dévalider
              </button>
            )}
            {verrouillee && (
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

      {verrouillee && (
        <div className={`${CARTE} px-4 py-3 flex items-center gap-2`} style={{ borderLeft: '3px solid #006633' }}>
          <Lock size={14} className="text-[#006633]" />
          <p className="text-xs text-iss-gray">
            Jury validé{deliberation.validee_par_nom && ` par ${deliberation.validee_par_nom}`}
            {deliberation.date_validation && ` le ${formatDateTime(deliberation.date_validation)}`}.
            Les notes concernées sont verrouillées et les décisions sont reportées sur les inscriptions.
          </p>
        </div>
      )}

      {verrouillee && deliberation.portee === 'annuelle' && (
        <SectionPassage
          deliberationId={deliberationId}
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

      {stats && Object.keys(stats.repartition).length > 0 && (
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
                <tr className="text-left text-xs font-semibold text-iss-gray uppercase tracking-wide border-b border-gray-100">
                  <th className="px-4 py-3 w-14 text-center">Rang</th>
                  <th className="px-4 py-3">Étudiant</th>
                  {!deliberation.classe && <th className="px-4 py-3">Classe</th>}
                  <th className="px-4 py-3 text-center">Moyenne</th>
                  <th className="px-4 py-3">Proposition</th>
                  <th className="px-4 py-3">Décision du jury</th>
                  <th className="px-4 py-3">Motif si dérogation</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {lignes.map(ligne => (
                  <LigneJury
                    key={ligne.id} ligne={ligne}
                    deliberationId={deliberationId}
                    decisions={decisions}
                    verrouillee={verrouillee}
                    afficherClasse={!deliberation.classe}
                    seuil={Number(deliberation.seuil_validation)}
                    onAjuster={ajusterLigne}
                    onNotifier={notifier}
                    onErreur={signaler}
                    documents={documents}
                  />
                ))}
              </tbody>
            </table>
          </div>
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
        message={
          "La validation fige les décisions, verrouille les notes concernées et met à jour " +
          "le statut de chaque inscription. Le compteur de redoublement est incrémenté pour " +
          "les redoublants. Seul un administrateur peut ensuite la dévalider."
        }
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

type MutationsDocuments = ReturnType<typeof useDocumentMutations>;

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
function SectionPassage({ deliberationId, onNotifier, onErreur }: {
  deliberationId: number;
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
    return (
      <div className={`${CARTE} px-4 py-3`} style={{ borderLeft: '3px solid #d97706' }}>
        <p className="text-xs text-iss-gray">
          Aucun étudiant ne repart : le jury n&apos;a prononcé ni admission ni
          redoublement.
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
  const { data: comptes } = useComptesList({ page: 1 });

  const [utilisateur, setUtilisateur] = useState('');
  const [role, setRole] = useState<RoleJuryIPGEI>('enseignant');
  // Quel membre est en cours de retrait : la mutation est partagée par toutes
  // les cartes, son `isPending` seul les ferait toutes tourner à la fois.
  const [retraitEnCours, setRetraitEnCours] = useState<number | null>(null);

  const moi = getStoredUser();
  const maPlace = membres.find(m => m.utilisateur === moi?.id);
  const disponibles = (comptes?.results ?? []).filter(
    c => c.is_active && !membres.some(m => m.utilisateur === c.id),
  );

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
        <select value={utilisateur} onChange={e => setUtilisateur(e.target.value)}
                className={SELECT} style={{ width: 240 }}>
          <option value="">Ajouter un membre…</option>
          {disponibles.map(c => (
            <option key={c.id} value={c.id}>{c.name || c.username}</option>
          ))}
        </select>
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
  ligne, deliberationId, decisions, verrouillee, afficherClasse, seuil, onAjuster,
  onNotifier, onErreur, documents,
}: {
  ligne: LigneDeliberation;
  deliberationId: number;
  decisions: { value: string; label: string }[];
  verrouillee: boolean;
  /** Faux sur un jury de classe : la colonne y répéterait la même valeur. */
  afficherClasse: boolean;
  seuil: number;
  onAjuster: { mutate: (v: never, o?: object) => void; isPending: boolean };
  onNotifier: (m: string) => void;
  onErreur: (e: unknown) => void;
  documents: MutationsDocuments;
}) {
  const [motif, setMotif] = useState(ligne.motif_ajustement);
  // Quel document cette ligne est en train d'éditer : la mutation est partagée
  // par toute la table, son `isPending` seul ferait tourner les trente lignes.
  const [edition, setEdition] = useState<'decision' | 'cnim' | null>(null);
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

  const telecharger = (blob: Blob, nom: string) => downloadBlob(blob, nom);

  return (
    <tr className="hover:bg-gray-50/60">
      <td className="px-4 py-3 text-center font-bold text-iss-gray">{ligne.rang ?? '—'}</td>
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
        {verrouillee && (
          <div className="flex items-center justify-end gap-1">
            <button
              title="Décision de délibération (PDF)"
              disabled={!!edition}
              onClick={() => {
                setEdition('decision');
                documents.decision.mutate(
                  { deliberation: deliberationId, inscription: ligne.inscription },
                  {
                    onSuccess: (b) => telecharger(b, `decision-${ligne.etudiant_matricule}.pdf`),
                    onError:   onErreur,
                    onSettled: () => setEdition(null),
                  },
                );
              }}
              className="p-2 rounded-lg text-iss-gray hover:bg-gray-100 hover:text-[#006633] transition-colors disabled:opacity-50">
              <IconeBouton enCours={edition === 'decision'} Icone={FileText} taille={13} />
            </button>
            {ligne.decision === 'autorise_cnim' && (
              <button
                title="Attestation d'autorisation CNIM (PDF)"
                disabled={!!edition}
                onClick={() => {
                  setEdition('cnim');
                  documents.attestationCnim.mutate(
                    { deliberation: deliberationId, inscription: ligne.inscription },
                    {
                      onSuccess: (b) => telecharger(b, `cnim-${ligne.etudiant_matricule}.pdf`),
                      onError:   onErreur,
                      onSettled: () => setEdition(null),
                    },
                  );
                }}
                className="p-2 rounded-lg text-iss-gray hover:bg-gray-100 hover:text-[#006633] transition-colors disabled:opacity-50">
                <IconeBouton enCours={edition === 'cnim'} Icone={FileBadge} taille={13} />
              </button>
            )}
          </div>
        )}
      </td>
    </tr>
  );
}
