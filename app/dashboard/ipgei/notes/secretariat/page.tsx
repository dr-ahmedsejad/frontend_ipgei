'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, FileSpreadsheet, FileText, Loader2, Plus, Trash2, Users,
} from 'lucide-react';

import { downloadBlob } from '@/lib/downloadBlob';
import {
  BTN_PRIMAIRE, BTN_SECONDAIRE, Badge, CARTE, DEGRADE, EnTetePage, Erreur,
  INPUT, SELECT,
} from '../../_ui';
import { ChampCorrecteur } from '../_champ-correcteur';
import { useProfsList } from '@/lib/api/profs-hooks';
import { useAnneeIPGEI } from '../../_annee';
import {
  useAnonymats, useEpreuvesTenues, useInscriptionsAll, useMatieresSelect,
  useOptionsNiveaux, useSecretariatAnonymat, useSemestresAll, useSessions,
} from '@/lib/api/ipgei-hooks';
import type {
  BilanRepartition, EpreuveChoisie, LotCorrection,
} from '@/lib/api/ipgei';

/**
 * Export secrétariat — la table de levée d'anonymat, et la répartition des
 * copies entre correcteurs.
 *
 * Deux documents, et tout tient dans ce qui les sépare :
 *
 *   · la LISTE porte le couple numéro ↔ matricule. Elle ne quitte pas le
 *     secrétariat : c'est elle qui permet de rendre les copies à leurs auteurs
 *     une fois la correction close.
 *   · la RÉPARTITION ne porte que des numéros. La remettre avec les matricules
 *     annulerait l'anonymat au moment précis où il sert.
 *
 * Les numéros valent pour la SESSION, non par matière ni par classe : la liste
 * couvre donc toutes les classes d'un même niveau confondues — un correcteur
 * reçoit un paquet de copies, pas une classe.
 */
export default function ExportSecretariatPage() {
  const { annee, setAnnee, options } = useAnneeIPGEI();

  const [semestreId, setSemestreId] = useState<number | null>(null);
  const [rattrapage, setRattrapage] = useState(false);
  const [niveau, setNiveau]         = useState('');
  const [matiereId, setMatiereId] = useState<number | null>(null);
  /** L'épreuve désignée, sous la forme « TYPE|AAAA-MM-JJ ». */
  const [epreuveCle, setEpreuveCle] = useState('');
  const [lots, setLots]   = useState<LotCorrection[]>([{ correcteur: '', nb: 20 }]);
  const [bilan, setBilan] = useState<BilanRepartition | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const { data: semestres = [] } = useSemestresAll({ annee_universitaire: annee });
  const { data: sessions  = [] } = useSessions(annee);
  const niveaux = useOptionsNiveaux();
  const { exporter, apercu, repartir } = useSecretariatAnonymat();

  const semestre = semestres.find(s => s.id === semestreId) ?? null;
  // Une campagne se déduit du semestre et du type d'épreuve : l'anonymat d'une
  // session normale ne désigne pas le même candidat que celui du rattrapage.
  const session = sessions.find(
    s => s.semestre === semestreId
      && s.type_session === (rattrapage ? 'rattrapage' : 'normale')) ?? null;

  // Seuls les niveaux qui suivent ce semestre : proposer les autres donnerait
  // une liste vide sans qu'on comprenne pourquoi.
  const niveauxDuSemestre = useMemo(
    () => (semestre ? niveaux.filter(n => semestre.niveaux.includes(n.value)) : []),
    [niveaux, semestre],
  );

  // La matière ne sert qu'aux fiches des correcteurs — la liste du secrétariat
  // couvre toute la campagne, matières confondues.
  const { data: matieres = [] } = useMatieresSelect({
    code_semestre: semestre?.code, actif: true,
  });

  // Les épreuves que le Suivi déclare TENUES. Une séance seulement planifiée
  // n'en est pas une : ses copies n'existent pas, et proposer d'en éditer les
  // fiches inviterait à préparer une correction sans objet.
  const { data: epreuves = [], isLoading: chargeEpreuves } =
    useEpreuvesTenues(session?.id ?? null, matiereId);

  // Un changement de matière ou de campagne périme le choix précédent.
  useEffect(() => {
    if (epreuveCle && !epreuves.some(e => `${e.type}|${e.date}` === epreuveCle)) {
      setEpreuveCle(''); setBilan(null);
    }
  }, [epreuves, epreuveCle]);

  const epreuve: EpreuveChoisie | undefined = useMemo(() => {
    if (!epreuveCle) return undefined;
    const [type, date] = epreuveCle.split('|');
    return { type, date };
  }, [epreuveCle]);

  // Les enseignants au fichier, pour compléter le nom du correcteur. La saisie
  // reste libre : un vacataire recruté pour la session n'y figure pas encore,
  // et il ne doit pas falloir créer sa fiche avant d'imprimer une feuille.
  const { data: profs } = useProfsList({ actif: true, page_size: 300 });
  const nomsCorrecteurs = useMemo(
    () => [...new Set((profs?.results ?? []).map(p => p.nom.trim()).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'fr')),
    [profs],
  );

  // Un DEVOIR SURVEILLÉ ne se corrige pas sous anonymat : il se tient en
  // classe, l'enseignant corrige ses propres élèves et rend les copies au
  // cours suivant. Masquer les noms n'y protège personne, et exigerait une
  // levée d'anonymat pour rien.
  const anonyme = !epreuve || epreuve.type !== 'DS';

  // Combien de copies existent réellement. Le compte est CONNU avant de
  // répartir : laisser saisir 80 sur 50 pour refuser au clic obligeait à tout
  // recommencer, alors que l'écran savait dès le départ que c'était impossible.
  //
  // Sous anonymat, ce sont les numéros tirés ; nominativement, les inscrits du
  // niveau — un devoir n'attend aucun tirage.
  const { data: anonymats = [] } = useAnonymats(session?.id ?? null);
  const { data: inscrits = [] } = useInscriptionsAll(
    anonyme ? undefined : { annee_universitaire: annee, actif: true,
                            ...(niveau ? { classe__niveau: niveau } : {}) });
  const disponibles = useMemo(
    () => (anonyme
      ? anonymats.filter(a => !niveau || a.niveau === niveau).length
      : inscrits.length),
    [anonyme, anonymats, inscrits, niveau],
  );
  const demandees = lots.reduce((t, l) => t + (l.nb || 0), 0);
  // Le dépassement ne se juge QUE si l'on sait à quoi comparer. À l'ouverture,
  // aucune campagne n'est choisie : `disponibles` vaut 0, et le premier lot en
  // porte 20 par défaut — l'écran annonçait « 20 demandées pour 0 disponibles »
  // avant même qu'on ait touché à quoi que ce soit.
  const compte = !!session && disponibles > 0;
  const trop = compte && demandees > disponibles;

  const pret = !!session && disponibles > 0;
  // QUEL format est en cours, et non « une mutation est en cours » : les deux
  // boutons partagent la même mutation, si bien que cliquer sur l'un faisait
  // tourner l'autre. `variables` porte les paramètres de l'appel en vol.
  const enCoursExport = (format: 'excel' | 'pdf') =>
    exporter.isPending && exporter.variables?.sortie === format;
  const enCoursFiches = (format: 'excel' | 'pdf') =>
    repartir.isPending && repartir.variables?.sortie === format;
  const echec = (e: unknown) => setErreur(e instanceof Error ? e.message : 'Erreur');
  const nomFichier = `${semestre?.code ?? ''}_${niveau || 'tous'}`
    + (epreuve ? `_${epreuve.type}_${epreuve.date}` : '');

  const telecharger = (sortie: 'excel' | 'pdf') => {
    if (!session) return;
    setErreur(null);
    exporter.mutate({ session: session.id, niveau: niveau || undefined, sortie }, {
      onSuccess: (b) => downloadBlob(
        b, `anonymat_${nomFichier}.${sortie === 'excel' ? 'xlsx' : 'pdf'}`),
      onError: echec,
    });
  };

  const lotsValides = lots.filter(l => l.correcteur.trim() && l.nb > 0);

  const voir = () => {
    if (!session || !lotsValides.length) return;
    setErreur(null); setBilan(null);
    apercu.mutate(
      { session: session.id, lots: lotsValides, niveau: niveau || undefined,
        // La matière porte l'émargement de l'épreuve, l'épreuve dit LAQUELLE :
        // sans elles, l'aperçu ne peut pas dire combien de copies manquent.
        matiere: matiereId ?? undefined, epreuve },
      { onSuccess: setBilan, onError: echec });
  };

  const imprimer = (sortie: 'pdf' | 'excel') => {
    if (!session || !lotsValides.length) return;
    setErreur(null);
    repartir.mutate(
      { session: session.id, lots: lotsValides, niveau: niveau || undefined,
        matiere: matiereId ?? undefined, sortie, epreuve },
      {
        onSuccess: (b) => downloadBlob(
          b, `collecte_${nomFichier}.${sortie === 'excel' ? 'xlsx' : 'pdf'}`),
        onError: echec,
      });
  };

  return (
    <div className="space-y-5 max-w-3xl">
      <Link href="/dashboard/ipgei/notes"
            className="inline-flex items-center gap-1.5 text-sm text-iss-gray hover:text-[#006633] transition-colors">
        <ArrowLeft size={14} /> Saisie des notes
      </Link>

      <EnTetePage
        icone={<Users size={14} className="text-white" />}
        titre="Export secrétariat"
        sousTitre="La correspondance anonymat — matricule, et la répartition des copies."
        actions={
          <select value={annee} className={SELECT} style={{ width: 140 }}
                  onChange={e => { setAnnee(e.target.value); setSemestreId(null); setBilan(null); }}>
            {options.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        }
      />

      <div className={`${CARTE} p-6 space-y-4`}>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="block text-xs font-semibold text-iss-dark mb-1.5">
              Semestre <span className="text-red-600">*</span>
            </label>
            <select value={semestreId ?? ''} className={SELECT}
                    onChange={e => { setSemestreId(e.target.value ? Number(e.target.value) : null);
                                     setNiveau(''); setBilan(null); }}>
              <option value="">— Choisir —</option>
              {semestres.map(s => (
                <option key={s.id} value={s.id}>{s.code} — {s.libelle_annee}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-iss-dark mb-1.5">Épreuve</label>
            <select value={rattrapage ? 'ratt' : 'normale'} className={SELECT}
                    onChange={e => { setRattrapage(e.target.value === 'ratt'); setBilan(null); }}>
              <option value="normale">Session normale</option>
              <option value="ratt">Rattrapage</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-iss-dark mb-1.5">Niveau</label>
            <select value={niveau} className={SELECT} disabled={!semestreId}
                    onChange={e => { setNiveau(e.target.value); setBilan(null); }}>
              <option value="">Tous les niveaux</option>
              {niveauxDuSemestre.map(n => (
                <option key={n.value} value={n.value}>{n.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Le tirage précède la correction : sans numéros, il n'y a rien à
            exporter ni à répartir. */}
        {semestreId && !session && (
          <p className="text-xs text-amber-700">
            Aucune campagne ouverte sur ce semestre.
          </p>
        )}
        {!!session && anonyme && disponibles === 0 && (
          <p className="text-xs text-amber-700">
            Aucun numéro tiré pour cette campagne{niveau && ` en ${niveau}`} : le
            tirage se fait depuis{' '}
            <Link href="/dashboard/ipgei/notes/anonymat"
                  className="text-[#006633] font-medium hover:underline">
              Anonymat des copies
            </Link>, avant la correction.
          </p>
        )}

        {/* Un devoir surveillé n'a pas d'anonymat à lever : la table de
            correspondance se résumerait à la liste de la classe, sous un titre
            qui mentirait. Les boutons disparaissent plutôt que d'échouer au
            clic. */}
        {!anonyme && (
          <p className="text-xs text-iss-gray">
            Un <b>devoir surveillé</b> se corrige à découvert : il n&apos;y a pas
            de correspondance à éditer. Les fiches des correcteurs, plus bas,
            portent directement les matricules et les noms.
          </p>
        )}

        <div className="flex gap-2 flex-wrap" hidden={!anonyme}>
          {/* Chaque bouton ne s'éteint que pour SON format : l'autre reste
              cliquable, il n'est pas concerné par l'édition en cours. */}
          <button onClick={() => telecharger('excel')}
                  disabled={!pret || enCoursExport('excel')}
                  className={BTN_PRIMAIRE} style={{ background: DEGRADE }}>
            {enCoursExport('excel')
              ? <Loader2 size={14} className="animate-spin" />
              : <FileSpreadsheet size={14} />}
            Liste Excel
          </button>
          <button onClick={() => telecharger('pdf')}
                  disabled={!pret || enCoursExport('pdf')}
                  className={BTN_SECONDAIRE}>
            {enCoursExport('pdf')
              ? <Loader2 size={14} className="animate-spin" />
              : <FileText size={14} />}
            Liste PDF
          </button>
        </div>

        {anonyme && (
          <p className="text-xs text-iss-gray">
            Deux colonnes, numéro d&apos;anonymat et matricule, toutes classes du
            niveau confondues. <b>Cette liste ne se remet pas aux correcteurs</b> :
            c&apos;est elle qui lève l&apos;anonymat.
          </p>
        )}
      </div>

      {/* ── Répartition des copies ─────────────────────────────────────── */}
      <div className={`${CARTE} p-6 space-y-4`}>
        <div>
          <h2 className="text-sm font-bold text-iss-dark">Répartir les copies</h2>
          <p className="text-xs text-iss-gray mt-1">
            {anonyme ? (
              <>
                Chacun reçoit une <b>fiche de collecte</b> : deux colonnes, numéro
                d&apos;anonymat et note, une ligne par copie. Les paquets suivent
                l&apos;ordre des numéros — «&nbsp;du n° 1 au n° 20&nbsp;». La
                feuille ne porte <b>aucun matricule</b>.
              </>
            ) : (
              <>
                Devoir surveillé : la fiche est <b>nominative</b> — matricule,
                nom, classe et note, rangés par <b>matricule croissant</b>.
                Aucun tirage d&apos;anonymat n&apos;est nécessaire.
              </>
            )}
          </p>

          <div className="mt-3">
            <label className="block text-xs font-semibold text-iss-dark mb-1.5">
              Matière
            </label>
            <select value={matiereId ?? ''} className={SELECT} disabled={!semestreId}
                    onChange={e => setMatiereId(e.target.value ? Number(e.target.value) : null)}>
              <option value="">— Choisir —</option>
              {matieres.map(m => <option key={m.id} value={m.id}>{m.intitule}</option>)}
            </select>
            {/* Le classeur se reverse par l'import, qui lit la matière dans la
                feuille : sans elle il ne saurait pas où poser les notes. Elle
                commande aussi le report des absences : l'émargement est saisi
                sur la séance d'épreuve, donc sur une matière. */}
            <p className="text-xs text-iss-gray mt-1.5">
              Exigée pour le classeur Excel, qui se reverse ensuite par{' '}
              <Link href="/dashboard/ipgei/notes/import"
                    className="text-[#006633] font-medium hover:underline">
                Import Excel
              </Link>. Facultative pour le PDF — mais c&apos;est elle qui reporte
              les <b>absences</b> pointées à{' '}
              <Link href="/dashboard/ipgei/notes/emargement"
                    className="text-[#006633] font-medium hover:underline">
                l&apos;émargement de l&apos;épreuve
              </Link> sur les fiches.
            </p>
          </div>

          {/* L'ÉPREUVE. Une matière en compte plusieurs par semestre : sans ce
              choix, les absents du premier devoir ressortaient « ABS » sur la
              fiche du second, et sur celle de l'examen. */}
          <div className="mt-3">
            <label className="block text-xs font-semibold text-iss-dark mb-1.5">
              Épreuve
            </label>
            <select value={epreuveCle} className={SELECT} disabled={!matiereId}
                    onChange={e => { setEpreuveCle(e.target.value); setBilan(null); }}>
              <option value="">
                {matiereId ? '— Toutes les épreuves du semestre —' : '— Choisir la matière —'}
              </option>
              {epreuves.map(e => (
                <option key={`${e.type}|${e.date}`} value={`${e.type}|${e.date}`}>
                  {e.libelle}
                </option>
              ))}
            </select>
            {/* Seul le Suivi dit qu'une épreuve a eu lieu. Le rappeler évite de
                chercher pourquoi un devoir programmé n'apparaît pas. */}
            {matiereId && !chargeEpreuves && !epreuves.length && (
              <p className="text-xs text-amber-700 mt-1.5">
                Aucune épreuve tenue pour cette matière. Une épreuve apparaît
                ici quand sa séance est <b>pointée « Fait »</b> dans le Suivi.
              </p>
            )}
            {!epreuveCle && !!epreuves.length && (
              <p className="text-xs text-amber-700 mt-1.5">
                Sans épreuve désignée, les absences de <b>toutes</b> les épreuves
                du semestre sont reportées sur la fiche.
              </p>
            )}
          </div>
        </div>

        <div className="space-y-2">
          {lots.map((lot, index) => (
            <div key={index} className="flex gap-2 items-center">
              <ChampCorrecteur
                valeur={lot.correcteur}
                noms={nomsCorrecteurs}
                onChange={nom => {
                  const suite = [...lots];
                  suite[index] = { ...lot, correcteur: nom };
                  setLots(suite); setBilan(null);
                }} />
              {/* Le maximum est ce qui RESTE, pas le total : à trois
                  correcteurs, chacun est borné par ce que les autres n'ont pas
                  pris. Tant qu'aucune campagne n'est choisie, aucun plafond ne
                  s'applique — écrêter contre un total inconnu bloquerait la
                  saisie à 1. */}
              <input type="number" min={1}
                     max={compte
                       ? Math.max(1, disponibles - (demandees - (lot.nb || 0)))
                       : undefined}
                     value={lot.nb}
                     className={INPUT} style={{ width: 90, textAlign: 'center' }}
                     onChange={e => {
                       const saisi = Math.max(1, Number(e.target.value) || 1);
                       const plafond = compte
                         ? Math.max(1, disponibles - (demandees - (lot.nb || 0)))
                         : saisi;
                       const suite = [...lots];
                       suite[index] = { ...lot, nb: Math.min(plafond, saisi) };
                       setLots(suite); setBilan(null);
                     }} />
              <span className="text-xs text-iss-gray w-12">copies</span>
              <button onClick={() => { setLots(lots.filter((_, i) => i !== index)); setBilan(null); }}
                      disabled={lots.length === 1}
                      aria-label="Retirer ce correcteur"
                      className="p-2 rounded-lg text-iss-gray hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-30">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          <div className="flex items-center gap-3 flex-wrap">
            <button onClick={() => setLots([
                      ...lots,
                      // Le nouveau lot ne prend que ce qui reste — sauf tant
                      // que le total est inconnu, où l'on propose la valeur
                      // usuelle.
                      { correcteur: '',
                        nb: compte
                          ? Math.max(1, Math.min(20, disponibles - demandees))
                          : 20 },
                    ])}
                    disabled={compte && demandees >= disponibles}
                    className={BTN_SECONDAIRE}>
              <Plus size={14} /> Ajouter un correcteur
            </button>
            {compte && (
              <span className={`text-xs ${trop ? 'text-red-600 font-semibold' : 'text-iss-gray'}`}>
                {demandees} / {disponibles} copie{disponibles > 1 ? 's' : ''} répartie
                {demandees > 1 ? 's' : ''}
                {demandees < disponibles && !trop
                  && ` · ${disponibles - demandees} sans correcteur`}
                {trop && ` · ${demandees - disponibles} de trop`}
              </span>
            )}
          </div>
        </div>

        {/* Dit AVANT le clic, et non après : c'est le sens de tout ce
            bornage. Le serveur refuse toujours de son côté — l'écran n'est
            pas une garantie, seulement une politesse. */}
        {trop && (
          <p className="text-xs text-red-600">
            {demandees} copies demandées pour {disponibles} disponibles.
            Retirez-en {demandees - disponibles}.
          </p>
        )}

        {erreur && <Erreur erreur={new Error(erreur)} />}

        <div className="flex gap-2 flex-wrap">
          <button onClick={voir}
                  disabled={!pret || trop || !lotsValides.length || apercu.isPending}
                  className={BTN_SECONDAIRE}>
            {apercu.isPending
              ? <Loader2 size={14} className="animate-spin" /> : <Users size={14} />}
            Voir la répartition
          </button>
          <button onClick={() => imprimer('excel')}
                  disabled={!pret || trop || !lotsValides.length || !matiereId
                            || enCoursFiches('excel')}
                  className={BTN_PRIMAIRE} style={{ background: DEGRADE }}>
            {enCoursFiches('excel')
              ? <Loader2 size={14} className="animate-spin" />
              : <FileSpreadsheet size={14} />}
            Fiches Excel
          </button>
          <button onClick={() => imprimer('pdf')}
                  disabled={!pret || trop || !lotsValides.length || enCoursFiches('pdf')}
                  className={BTN_SECONDAIRE}>
            {enCoursFiches('pdf')
              ? <Loader2 size={14} className="animate-spin" />
              : <FileText size={14} />}
            Fiches PDF
          </button>
        </div>

        {bilan && (
          <div className="space-y-2 pt-3" style={{ borderTop: '1px solid #f1f5f9' }}>
            <div className="flex items-center gap-2 flex-wrap">
              <Badge ton={bilan.restantes.length ? 'ambre' : 'vert'}>
                {bilan.reparties} / {bilan.total}
              </Badge>
              <span className="text-sm text-iss-dark">copies réparties</span>
            </div>
            <ul className="text-xs text-iss-gray space-y-0.5">
              {bilan.paquets.map(p => (
                <li key={p.correcteur}>
                  <b className="text-iss-dark">{p.correcteur}</b> — {p.nb} copie
                  {p.nb > 1 ? 's' : ''},{' '}
                  {bilan.anonyme
                    ? `du n° ${p.premier} au n° ${p.dernier}`
                    : `du matricule ${p.premier} au ${p.dernier}`}
                  {/* Ce qu'il aura réellement en main : le paquet annoncé moins
                      les absents de l'émargement. Le dire ici évite qu'il
                      cherche une copie qui n'a jamais existé. */}
                  {p.absents > 0 && (
                    <span className="text-amber-700">
                      {' '}· dont {p.absents} absent{p.absents > 1 ? 's' : ''},
                      soit <b>{p.a_corriger}</b> à corriger
                    </span>
                  )}
                </li>
              ))}
            </ul>
            {/* Sans matière, l'émargement ne peut pas être rattaché : mieux
                vaut le dire que de laisser croire à une correction complète. */}
            {!matiereId && (
              <p className="text-xs text-iss-gray">
                Choisissez la matière pour que les <b>absences pointées à
                l&apos;épreuve</b> apparaissent sur les fiches.
              </p>
            )}
            {/* Les copies non attribuées sont dites, jamais réparties d'office :
                le secrétariat doit voir ce qu'il garde en main. */}
            {bilan.restantes.length > 0 && (
              <p className="text-xs text-amber-700">
                {bilan.restantes.length} copie{bilan.restantes.length > 1 ? 's' : ''} sans
                correcteur : {bilan.anonyme && 'n° '}{bilan.restantes.join(', ')}.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
