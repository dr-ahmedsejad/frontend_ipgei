'use client';

import { useState } from 'react';
import {
  ArrowRight, CalendarDays, CheckCircle2, Download, Loader2, PlayCircle, Plus,
  Repeat, ThumbsUp,
  X, XCircle,
} from 'lucide-react';

import { Pagination } from '@/components/Pagination';
import { downloadBlob } from '@/lib/downloadBlob';
import {
  BTN_PRIMAIRE, BTN_SECONDAIRE, Badge, CARTE, Chargement, DEGRADE, EnTetePage,
  Erreur, INPUT, SELECT, Toast, Vide, tonStatutPermutation,
} from '../_ui';
import { useAnneeIPGEI } from '../_annee';
import {
  useClassesSelect, useInscriptions, usePermutationEtudiantMutations,
  usePermutationProfMutations, usePermutationsEtudiant, usePermutationsProf,
  useSousGroupes,
} from '@/lib/api/ipgei-hooks';
import type {
  PermutationEtudiant, PermutationProf, SeanceReelle, StatutPermutation,
} from '@/types/ipgei';

type Onglet = 'prof' | 'etudiant';

const STATUTS: { value: StatutPermutation | ''; label: string }[] = [
  { value: '',          label: 'Tous les statuts' },
  { value: 'demandee',  label: 'Demandée' },
  { value: 'accordee',  label: 'Accord obtenu' },
  { value: 'validee',   label: 'Validée — à appliquer' },
  { value: 'appliquee', label: 'Appliquée' },
  { value: 'refusee',   label: 'Refusée' },
];

export default function PermutationsPage() {
  const [onglet, setOnglet] = useState<Onglet>('prof');
  const [statut, setStatut] = useState('');
  const [page, setPage]     = useState(1);
  const [toast, setToast]   = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const notifier = (m: string) => { setToast(m); setTimeout(() => setToast(null), 3000); };
  const signaler = (e: unknown) => setErreur(e instanceof Error ? e.message : 'Erreur');

  return (
    <div className="space-y-5 max-w-6xl">
      <EnTetePage
        icone={<Repeat size={14} className="text-white" />}
        titre="Permutations"
        sousTitre="Enseignants : demande, accord, validation. Étudiants : décision directe, sur formulaire signé."
      />

      <div className="flex gap-2 flex-wrap items-center">
        <div className="flex rounded-xl border border-gray-200 overflow-hidden">
          {([['prof', 'Enseignants'], ['etudiant', 'Étudiants']] as const).map(([cle, label]) => (
            <button key={cle} onClick={() => { setOnglet(cle); setPage(1); }}
                    className={`px-4 py-2.5 text-sm font-semibold transition-all ${
                      onglet === cle ? 'bg-[#006633] text-white' : 'bg-white text-iss-gray hover:bg-gray-50'
                    }`}>
              {label}
            </button>
          ))}
        </div>
        <select value={statut} onChange={e => { setStatut(e.target.value); setPage(1); }}
                className={SELECT} style={{ width: 200 }}>
          {STATUTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </div>

      {erreur && <Erreur erreur={new Error(erreur)} />}

      {onglet === 'prof'
        ? <ListeProf statut={statut} page={page} setPage={setPage} onNotifier={notifier} onErreur={signaler} />
        : <ListeEtudiant statut={statut} page={page} setPage={setPage} onNotifier={notifier} onErreur={signaler} />}

      <Toast message={toast} />
    </div>
  );
}

// ── Actions du circuit ───────────────────────────────────────────────────────
function ActionsCircuit({
  statut, mutations, id, onNotifier, onErreur,
}: {
  statut: StatutPermutation;
  mutations: {
    accorder: { mutate: (v: number, o?: object) => void; isPending: boolean };
    valider:  { mutate: (v: number, o?: object) => void; isPending: boolean };
    appliquer:{ mutate: (v: number, o?: object) => void; isPending: boolean };
    refuser:  { mutate: (v: { id: number; motif: string }, o?: object) => void; isPending: boolean };
  };
  id: number;
  onNotifier: (m: string) => void;
  onErreur: (e: unknown) => void;
}) {
  const options = { onError: onErreur };

  if (statut === 'appliquee' || statut === 'refusee') return null;

  return (
    <div className="flex items-center gap-1 flex-wrap justify-end">
      {statut === 'demandee' && (
        <button onClick={() => mutations.accorder.mutate(id, { ...options, onSuccess: () => onNotifier('Accord enregistré') })}
                title="Accord de la contrepartie"
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-iss-gray hover:border-blue-400 hover:text-blue-700 transition-all">
          <ThumbsUp size={12} /> Accorder
        </button>
      )}
      {(statut === 'demandee' || statut === 'accordee') && (
        <button onClick={() => mutations.valider.mutate(id, { ...options, onSuccess: () => onNotifier('Validée par le directeur') })}
                title="Validation du directeur"
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-iss-gray hover:border-violet-400 hover:text-violet-700 transition-all">
          <CheckCircle2 size={12} /> Valider
        </button>
      )}
      {statut === 'validee' && (
        <button onClick={() => mutations.appliquer.mutate(id, { ...options, onSuccess: () => onNotifier('Permutation appliquée') })}
                title="Appliquer sur l'emploi du temps"
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-white transition-all hover:opacity-90"
                style={{ background: DEGRADE }}>
          <PlayCircle size={12} /> Appliquer
        </button>
      )}
      <button onClick={() => {
                const motif = window.prompt('Motif du refus :') ?? '';
                mutations.refuser.mutate({ id, motif }, { ...options, onSuccess: () => onNotifier('Permutation refusée') });
              }}
              title="Refuser"
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-iss-gray hover:border-red-400 hover:text-red-600 transition-all">
        <XCircle size={12} /> Refuser
      </button>
    </div>
  );
}

// ── Permutations d'enseignants ───────────────────────────────────────────────
function ListeProf({
  statut, page, setPage, onNotifier, onErreur,
}: {
  statut: string; page: number; setPage: (p: number) => void;
  onNotifier: (m: string) => void; onErreur: (e: unknown) => void;
}) {
  const { data, isLoading, error } = usePermutationsProf({ page, statut: statut || undefined });
  const mutations = usePermutationProfMutations();

  const items = data?.results ?? [];

  return (
    <>
      <Erreur erreur={error} />
      <div className={CARTE}>
        {isLoading && !data ? <Chargement /> : items.length === 0 ? (
          <Vide texte="Aucune permutation d'enseignants. Elles se créent depuis l'écran « Emploi du temps »." />
        ) : (
          <div className="divide-y divide-gray-100">
            {items.map(p => <LigneProf key={p.id} permutation={p} mutations={mutations}
                                       onNotifier={onNotifier} onErreur={onErreur} />)}
          </div>
        )}
        {items.length > 0 && (
          <div className="px-5 py-3 border-t border-gray-100 flex items-center
                          justify-between gap-3 flex-wrap">
            <span className="text-xs text-iss-gray">
              {data?.count ?? 0} au total
            </span>
            {(data?.pages ?? 1) > 1 && (
              <Pagination page={page} pages={data?.pages ?? 1}
                          count={data?.count ?? 0} onPage={setPage} />
            )}
          </div>
        )}
      </div>
    </>
  );
}

/**
 * Période couverte par un échange, en dates plutôt qu'en nombre de semaines.
 *
 * « Portée : 4 semaines » ne dit rien d'utilisable pour couvrir un cours : il
 * fallait rouvrir le calendrier pour savoir de quelles dates il s'agissait.
 */
function periode(a?: SeanceReelle, b?: SeanceReelle, nb = 1): string {
  const jour = (s?: SeanceReelle) =>
    (s?.date ? new Date(s.date).toLocaleDateString('fr-FR') : null);
  const debut = jour(a) ?? jour(b);
  if (!debut) return `Portée : ${nb} semaine${nb > 1 ? 's' : ''}`;
  if (nb <= 1) return `Le ${debut}`;
  return `À partir du ${debut}, sur ${nb} semaines de cours`;
}

function LigneProf({
  permutation: p, mutations, onNotifier, onErreur,
}: {
  permutation: PermutationProf;
  mutations: ReturnType<typeof usePermutationProfMutations>;
  onNotifier: (m: string) => void; onErreur: (e: unknown) => void;
}) {
  const a = p.seance_a_detail;
  const b = p.seance_b_detail;

  return (
    <div className="px-5 py-4">
      {/* Même structure que la ligne étudiant : l'échange d'abord, le contexte
          ensuite, le statut à droite. Les badges ouvraient la ligne et
          repoussaient le contenu au troisième rang. */}
      <div className="flex items-start gap-3 flex-wrap">
        <div className="flex-1 min-w-[280px]">
          <p className="text-xs text-iss-gray">
            {a?.classe_nom} · {a?.jour_libelle} {a?.creneau_libelle}
          </p>

          <div className="flex items-center gap-2 mt-1.5 text-sm flex-wrap">
            <div className="px-2.5 py-1 rounded-lg bg-gray-50 border border-gray-200">
              <span className="font-bold text-iss-dark">{a?.matiere_code}</span>
              <span className="text-iss-gray"> · {a?.prof_nom || '—'}</span>
            </div>
            <Repeat size={14} className="text-[#7c3aed] flex-shrink-0" />
            <div className="px-2.5 py-1 rounded-lg bg-gray-50 border border-gray-200">
              <span className="font-bold text-iss-dark">{b?.matiere_code}</span>
              <span className="text-iss-gray"> · {b?.prof_nom || '—'}</span>
            </div>
          </div>

          {/* Quand l'échange prend effet. « Portée : 4 semaines » ne disait
              rien d'utilisable pour couvrir un cours. */}
          <p className="mt-1.5 text-xs text-iss-gray inline-flex items-center gap-1.5">
            <CalendarDays size={12} className="text-[#7c3aed]" />
            {periode(a, b, p.nb_semaines)}
          </p>
        </div>

        <div className="flex flex-col items-end gap-1.5">
          <Badge ton={tonStatutPermutation(p.statut)}>{p.statut_display}</Badge>
          {p.action_directe && <Badge ton="violet">Action directe</Badge>}
        </div>

        <ActionsCircuit statut={p.statut} mutations={mutations} id={p.id}
                        onNotifier={onNotifier} onErreur={onErreur} />
      </div>

      {(p.motif || p.motif_refus || p.statut === 'appliquee') && (
        <div className="mt-2.5 pt-2.5 border-t border-gray-100 text-xs space-y-1">
          {p.motif && <p className="text-iss-gray">Motif : {p.motif}</p>}
          {p.motif_refus && <p className="text-red-600">Refus : {p.motif_refus}</p>}
          {p.statut === 'appliquee' && (
            // `{'  '}` explicite : une expression suivie d'un retour à la
            // ligne perd son espace au rendu, et le nombre se collait au mot.
            <p className="text-emerald-700">
              {p.seances_impactees}{' '}
              séance{p.seances_impactees > 1 ? 's' : ''}{' '}
              permutée{p.seances_impactees > 1 ? 's' : ''}. La charge et le
              pointage suivent l&apos;enseignant effectif.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Permutations d'étudiants ─────────────────────────────────────────────────
function ListeEtudiant({
  statut, page, setPage, onNotifier, onErreur,
}: {
  statut: string; page: number; setPage: (p: number) => void;
  onNotifier: (m: string) => void; onErreur: (e: unknown) => void;
}) {
  const { data, isLoading, error } = usePermutationsEtudiant({ page, statut: statut || undefined });
  const mutations = usePermutationEtudiantMutations();
  const [formOuvert, setFormOuvert] = useState(false);

  const items = data?.results ?? [];

  return (
    <>
      <Erreur erreur={error} />

      {/* La demande se fait sur papier, signée ; l'application ne fait que
          l'enregistrer. Le formulaire est donc à portée du même écran. */}
      <div className="flex justify-end gap-2 flex-wrap">
        <button onClick={() => mutations.formulaire.mutate(undefined, {
                  onSuccess: (b) => downloadBlob(b, 'demande-changement-de-classe.pdf'),
                  onError: onErreur,
                })}
                disabled={mutations.formulaire.isPending}
                className={BTN_SECONDAIRE}>
          {mutations.formulaire.isPending
            ? <Loader2 size={14} className="animate-spin" />
            : <Download size={14} />}
          {mutations.formulaire.isPending ? 'Édition…' : 'Formulaire de demande'}
        </button>
        <button onClick={() => setFormOuvert(true)} className={BTN_PRIMAIRE} style={{ background: DEGRADE }}>
          <Plus size={14} /> Changement de classe
        </button>
      </div>

      {formOuvert && (
        <FormulaireChangementClasse
          onFerme={() => setFormOuvert(false)}
          onCree={(m) => { setFormOuvert(false); onNotifier(m); }}
          create={mutations.appliquerMaintenant}
        />
      )}

      <div className={CARTE}>
        {isLoading && !data ? <Chargement /> : items.length === 0 ? (
          <Vide texte="Aucun changement de classe demandé." />
        ) : (
          <div className="divide-y divide-gray-100">
            {items.map(p => <LigneEtudiant key={p.id} permutation={p} mutations={mutations}
                                           onNotifier={onNotifier} onErreur={onErreur} />)}
          </div>
        )}
        {items.length > 0 && (
          <div className="px-5 py-3 border-t border-gray-100 flex items-center
                          justify-between gap-3 flex-wrap">
            <span className="text-xs text-iss-gray">
              {data?.count ?? 0} au total
            </span>
            {(data?.pages ?? 1) > 1 && (
              <Pagination page={page} pages={data?.pages ?? 1}
                          count={data?.count ?? 0} onPage={setPage} />
            )}
          </div>
        )}
      </div>
    </>
  );
}

function LigneEtudiant({
  permutation: p, mutations, onNotifier, onErreur,
}: {
  permutation: PermutationEtudiant;
  mutations: ReturnType<typeof usePermutationEtudiantMutations>;
  onNotifier: (m: string) => void; onErreur: (e: unknown) => void;
}) {
  const applique = p.statut === 'appliquee';

  return (
    <div className="px-5 py-4">
      {/* Le mouvement d'abord, en une ligne : qui, d'où, vers où. Le reste —
          statut, motif, mention de conservation — vient après, en second plan.
          Tout était auparavant empilé au même poids. */}
      <div className="flex items-start gap-3 flex-wrap">
        <div className="flex-1 min-w-[280px]">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-bold text-iss-dark">{p.etudiant_nom}</span>
            <span className="text-xs text-iss-gray font-mono">{p.etudiant_matricule}</span>
          </div>

          <div className="flex items-center gap-2 mt-1.5 text-sm flex-wrap">
            <span className="px-2.5 py-1 rounded-lg bg-gray-50 border border-gray-200 font-semibold">
              {p.classe_source_nom}
            </span>
            {p.est_echange
              ? <Repeat size={14} className="text-[#7c3aed] flex-shrink-0" />
              : <ArrowRight size={14} className="text-iss-gray flex-shrink-0" />}
            <span className="px-2.5 py-1 rounded-lg bg-gray-50 border border-gray-200 font-semibold">
              {p.classe_cible_nom}
            </span>
          </div>

          {/* Un échange engage deux élèves : le second doit se lire ici, sinon
              la ligne laisse croire à un simple transfert. */}
          {p.est_echange && (
            <div className="flex items-center gap-2 mt-1.5 text-sm flex-wrap">
              <span className="text-sm font-bold text-iss-dark">{p.etudiant_b_nom}</span>
              <span className="text-xs text-iss-gray font-mono">{p.etudiant_b_matricule}</span>
              <span className="text-xs text-iss-gray">— en sens inverse</span>
            </div>
          )}
        </div>

        <div className="flex flex-col items-end gap-1.5">
          <Badge ton={tonStatutPermutation(p.statut)}>{p.statut_display}</Badge>
          {p.est_echange && <Badge ton="violet">Échange</Badge>}
        </div>

        <ActionsCircuit statut={p.statut} mutations={mutations} id={p.id}
                        onNotifier={onNotifier} onErreur={onErreur} />
      </div>

      {(p.motif || p.motif_refus || applique) && (
        <div className="mt-2.5 pt-2.5 border-t border-gray-100 text-xs space-y-1">
          {p.motif && <p className="text-iss-gray">Motif : {p.motif}</p>}
          {p.motif_refus && <p className="text-red-600">Refus : {p.motif_refus}</p>}
          {applique && (
            <p className="text-emerald-700">
              {p.est_echange ? 'Échange effectué' : 'Transfert effectué'} — notes,
              absences et historique conservés.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function FormulaireChangementClasse({
  onFerme, onCree, create,
}: {
  onFerme: () => void; onCree: (m: string) => void;
  create: { mutate: (v: never, o?: object) => void; isPending: boolean };
}) {
  const { annee } = useAnneeIPGEI();
  const [recherche, setRecherche] = useState('');
  const [inscriptionId, setInscriptionId] = useState<number | null>(null);
  const [classeCible, setClasseCible]     = useState<number | null>(null);
  const [sousGroupeCible, setSousGroupeCible] = useState<number | null>(null);
  // Contrepartie de l'échange. Nulle = transfert simple, quand la classe
  // d'accueil a de la place et que personne n'en sort.
  const [contrepartieId, setContrepartieId] = useState<number | null>(null);
  const [motif, setMotif]     = useState('');
  const [erreur, setErreur]   = useState<string | null>(null);

  const { data: inscriptionsPage } = useInscriptions({
    page: 1, annee_universitaire: annee || '__aucune__',
    search: recherche || undefined, actif: true,
  });
  const inscriptions = inscriptionsPage?.results ?? [];
  const inscription  = inscriptions.find(i => i.id === inscriptionId);

  const { data: classes = [] } = useClassesSelect({ annee_universitaire: annee, actif: true });
  // On reste au même niveau et à la même année : le backend le refuserait sinon.
  const cibles = classes.filter(
    c => inscription && c.niveau === inscription.niveau && c.id !== inscription.classe,
  );
  const { data: sousGroupes = [] } = useSousGroupes(classeCible);

  // Candidats à l'échange : les inscrits de la classe d'accueil. C'est le
  // serveur qui l'exige — une contrepartie venue d'ailleurs ne libérerait
  // aucune place là où il faut.
  const { data: candidatsPage } = useInscriptions({
    page: 1, annee_universitaire: annee || '__aucune__',
    classe: classeCible ?? undefined, actif: true,
  });
  const candidats = (candidatsPage?.results ?? []).filter(i => i.id !== inscriptionId);
  const contrepartie = candidats.find(i => i.id === contrepartieId);

  const enregistrer = () => {
    if (!inscriptionId) { setErreur('Choisissez un étudiant.'); return; }
    if (!classeCible)   { setErreur('Choisissez la classe d\'accueil.'); return; }
    setErreur(null);
    create.mutate(
      {
        inscription: inscriptionId, classe_cible: classeCible,
        inscription_b: contrepartieId, sous_groupe_cible: sousGroupeCible,
        motif,
      } as never,
      {
        onSuccess: () => onCree(contrepartieId
          ? 'Permutation effectuée'
          : 'Transfert effectué'),
        onError: (e: unknown) => setErreur(e instanceof Error ? e.message : 'Erreur'),
      },
    );
  };

  return (
    <div className={`${CARTE} p-6`} style={{ borderLeft: '3px solid #006633' }}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-iss-dark">Changement de classe</h3>
          <p className="text-xs text-iss-gray">
            Appliqué immédiatement, sur présentation du formulaire signé. Les
            inscriptions sont déplacées, jamais recréées : notes, absences et
            historique suivent chaque étudiant dans sa nouvelle classe.
          </p>
        </div>
        <button onClick={onFerme} className="p-1 rounded-lg text-iss-gray hover:bg-gray-100 transition-colors">
          <X size={14} />
        </button>
      </div>

      <div className="mb-4">
        <label className="block text-xs font-semibold text-iss-dark mb-1.5">Étudiant</label>
        <input value={recherche} onChange={e => setRecherche(e.target.value)}
               placeholder="Nom ou matricule…" className={`${INPUT} mb-2`} autoFocus />
        <div className="max-h-44 overflow-y-auto rounded-xl border border-gray-200 divide-y divide-gray-100">
          {inscriptions.length === 0 ? (
            <p className="px-3 py-4 text-sm text-iss-gray">Aucune inscription trouvée.</p>
          ) : inscriptions.map(i => (
            <button key={i.id} type="button"
                    onClick={() => { setInscriptionId(i.id); setClasseCible(null);
                                     setSousGroupeCible(null); setContrepartieId(null); }}
                    className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                      inscriptionId === i.id ? 'bg-[#006633]/10 font-semibold text-[#006633]' : 'hover:bg-gray-50'
                    }`}>
              {i.etudiant_nom} <span className="text-iss-gray">· {i.etudiant_matricule} · {i.classe_nom}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-semibold text-iss-dark mb-1.5">Classe d&apos;accueil</label>
          <select value={classeCible ?? ''} className={SELECT} disabled={!inscription}
                  onChange={e => { setClasseCible(e.target.value ? Number(e.target.value) : null);
                                   setSousGroupeCible(null); setContrepartieId(null); }}>
            <option value="">{inscription ? 'Choisir…' : 'Choisissez d\'abord un étudiant'}</option>
            {cibles.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
          </select>
          {inscription && cibles.length === 0 && (
            <p className="text-xs text-amber-700 mt-1">
              Aucune autre classe en {inscription.niveau} pour cette année.
            </p>
          )}
        </div>
        <div>
          <label className="block text-xs font-semibold text-iss-dark mb-1.5">Sous-groupe de TP</label>
          <select value={sousGroupeCible ?? ''} className={SELECT}
                  disabled={!classeCible || sousGroupes.length === 0}
                  onChange={e => setSousGroupeCible(e.target.value ? Number(e.target.value) : null)}>
            <option value="">{sousGroupes.length === 0 ? 'Aucun sous-groupe' : 'Aucun'}</option>
            {sousGroupes.map(sg => <option key={sg.id} value={sg.id}>{sg.libelle}</option>)}
          </select>
        </div>
        {/* Une classe pleine ne peut accueillir qu'en libérant une place :
            l'échange est la forme courante. Le transfert simple reste
            possible quand la classe d'accueil a de la place. */}
        <div className="sm:col-span-2">
          <label className="block text-xs font-semibold text-iss-dark mb-1.5">
            Étudiant échangé
            <span className="font-normal text-iss-gray"> — de {inscription?.classe_nom ?? 'sa classe'} vers celle-ci</span>
          </label>
          {!classeCible ? (
            <p className="text-xs text-iss-gray px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50">
              Choisissez d&apos;abord la classe d&apos;accueil.
            </p>
          ) : candidats.length === 0 ? (
            <p className="text-xs text-amber-700 px-3 py-2.5 rounded-xl border border-amber-100 bg-amber-50">
              Aucun inscrit dans cette classe : seul un transfert simple est possible.
            </p>
          ) : (
            <div className="max-h-40 overflow-y-auto rounded-xl border border-gray-200 divide-y divide-gray-100">
              <button type="button" onClick={() => setContrepartieId(null)}
                      className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                        contrepartieId === null
                          ? 'bg-[#006633]/10 font-semibold text-[#006633]' : 'hover:bg-gray-50'
                      }`}>
                Aucun — transfert simple
                <span className="text-iss-gray"> · l&apos;étudiant rejoint la classe sans contrepartie</span>
              </button>
              {candidats.map(i => (
                <button key={i.id} type="button" onClick={() => setContrepartieId(i.id)}
                        className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                          contrepartieId === i.id
                            ? 'bg-[#006633]/10 font-semibold text-[#006633]' : 'hover:bg-gray-50'
                        }`}>
                  {i.etudiant_nom}
                  <span className="text-iss-gray"> · {i.etudiant_matricule}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Ce que l'opération produit, avant de la demander. */}
        {inscription && classeCible && (
          <div className="sm:col-span-2 px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm">
            <p>
              <span className="font-semibold text-iss-dark">{inscription.etudiant_nom}</span>
              <span className="text-iss-gray"> {inscription.classe_nom} → </span>
              <span className="font-semibold text-iss-dark">
                {cibles.find(c => c.id === classeCible)?.nom}
              </span>
            </p>
            {contrepartie && (
              <p className="mt-0.5">
                <span className="font-semibold text-iss-dark">{contrepartie.etudiant_nom}</span>
                <span className="text-iss-gray"> {contrepartie.classe_nom} → </span>
                <span className="font-semibold text-iss-dark">{inscription.classe_nom}</span>
              </p>
            )}
          </div>
        )}

        <div className="sm:col-span-2">
          <label className="block text-xs font-semibold text-iss-dark mb-1.5">Motif</label>
          <input value={motif} className={INPUT} placeholder="Rééquilibrage d'effectifs, demande familiale…"
                 onChange={e => setMotif(e.target.value)} />
        </div>
      </div>


      {erreur && <p className="mt-3 text-sm text-red-600">{erreur}</p>}

      <div className="flex gap-2 mt-5">
        <button onClick={enregistrer} disabled={create.isPending}
                className={BTN_PRIMAIRE} style={{ background: DEGRADE }}>
          {create.isPending && <Loader2 size={14} className="animate-spin" />}
          {create.isPending
            ? 'Application…'
            : contrepartieId ? 'Permuter' : 'Transférer'}
        </button>
        <button onClick={onFerme} className={BTN_SECONDAIRE}>Annuler</button>
      </div>
    </div>
  );
}
