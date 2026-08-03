'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  FileText, History, Pencil, Plus, Receipt, Search, Trash2, UserCheck, Wallet, X,
} from 'lucide-react';

import { ConfirmModal } from '@/components/ConfirmModal';
import { Pagination } from '@/components/Pagination';
import {
  BTN_PRIMAIRE, BTN_SECONDAIRE, Badge, CARTE, Chargement, DEGRADE, EnTetePage,
  Erreur, INPUT, SELECT, Toast, Vide,
} from '../_ui';
import { useAnneeIPGEI } from '../_annee';
import {
  useClassesSelect, useHistoriqueClasses, useInscriptionMutations, useInscriptions,
  useSousGroupes,
} from '@/lib/api/ipgei-hooks';
import { documentsApi } from '@/lib/api/ipgei';
import { listEtudiants } from '@/lib/api/absences';
import { NIVEAUX, type Inscription, type StatutInscription } from '@/types/ipgei';

const STATUTS: { value: StatutInscription | ''; label: string }[] = [
  { value: '',              label: 'Tous les statuts' },
  { value: 'actif',         label: 'En cours' },
  { value: 'admis',         label: 'Admis en 2e année' },
  { value: 'reoriente',     label: 'Réorienté' },
  { value: 'redoublant',    label: 'Redoublant' },
  { value: 'autorise_cnim', label: 'Autorisé CNIM' },
  { value: 'abandon',       label: 'Abandon' },
];

/**
 * Message de confirmation, matières comprises.
 *
 * À l'IPGEI on ne s'inscrit pas matière par matière : entrer dans une classe,
 * c'est suivre toute la maquette de son niveau, sur les deux semestres. Le
 * dire évite d'aller vérifier ailleurs que l'étudiant apparaît bien dans les
 * grilles de notes.
 */
function messageInscription(base: string, creee: unknown): string {
  const n = (creee as { matieres_inscrites?: number } | undefined)?.matieres_inscrites;
  if (!n) return base;
  return `${base} · ${n} matière${n > 1 ? 's' : ''} rattachée${n > 1 ? 's' : ''}`;
}

/** Montant lisible, sans décimales inutiles : les frais sont des sommes rondes. */
function montantFrais(montant: string): string {
  const n = Number(montant);
  if (!n) return '—';
  return `${n.toLocaleString('fr-FR')} MRU `;
}

function tonStatut(statut: StatutInscription) {
  if (statut === 'admis' || statut === 'autorise_cnim') return 'vert' as const;
  if (statut === 'reoriente' || statut === 'abandon')   return 'rouge' as const;
  if (statut === 'redoublant')                          return 'ambre' as const;
  return 'bleu' as const;
}

export default function InscriptionsIPGEIPage() {
  const { annee, setAnnee, options } = useAnneeIPGEI();
  const [page, setPage]           = useState(1);
  const [recherche, setRecherche] = useState('');
  const [classeFiltre, setClasseFiltre] = useState('');
  const [niveauFiltre, setNiveauFiltre] = useState('');
  const [statut, setStatut]       = useState('');

  const { data: classes = [] } = useClassesSelect({ annee_universitaire: annee, actif: true });
  const { data, isLoading, error } = useInscriptions({
    page,
    annee_universitaire: annee || '__aucune__',
    search: recherche || undefined,
    classe: classeFiltre ? Number(classeFiltre) : undefined,
    classe__niveau: niveauFiltre || undefined,
    statut: statut || undefined,
  });
  const { nouvelle, update, remove } = useInscriptionMutations();

  const [formOuvert, setFormOuvert] = useState(false);
  const [edition, setEdition]       = useState<Inscription | null>(null);
  const [aSupprimer, setASupprimer] = useState<Inscription | null>(null);
  const [historique, setHistorique] = useState<Inscription | null>(null);
  const [paiement, setPaiement]     = useState<Inscription | null>(null);
  const [erreurDoc, setErreurDoc]   = useState<string | null>(null);

  /**
   * Téléchargement d'un document officiel.
   *
   * Chaque tirage porte son propre numéro de série et son QR de vérification :
   * le serveur les émet, le navigateur ne fait que recevoir le fichier.
   */
  const telecharger = async (quoi: 'attestation' | 'recu', i: Inscription) => {
    setErreurDoc(null);
    try {
      const blob = quoi === 'recu'
        ? await documentsApi.recuPaiement(i.id)
        : await documentsApi.attestationInscription(i.id);
      const url = URL.createObjectURL(blob);
      const a   = document.createElement('a');
      a.href     = url;
      a.download = `${quoi === 'recu' ? 'Recu' : 'Attestation'}_${i.etudiant_matricule}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setErreurDoc(e instanceof Error ? e.message : 'Émission impossible.');
    }
  };
  const [toast, setToast]           = useState<string | null>(null);

  const notifier = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2800); };

  const inscriptions = data?.results ?? [];
  const total        = data?.count ?? 0;

  return (
    <div className="space-y-5 max-w-6xl">
      <EnTetePage
        icone={<UserCheck size={14} className="text-white" />}
        titre="Inscriptions"
        sousTitre={`${total} inscription${total !== 1 ? 's' : ''} pour ${annee || '—'}.`}
        actions={
          <button onClick={() => { setEdition(null); setFormOuvert(true); }}
                  className={BTN_PRIMAIRE} style={{ background: DEGRADE }}>
            <Plus size={14} /> Inscrire un étudiant
          </button>
        }
      />

      <Erreur erreur={error} />
      {/* L'émission d'un document peut être refusée à bon droit — reçu demandé
          avant paiement, attestation sur une inscription close. Le motif doit
          se lire, sinon le bouton paraît simplement cassé. */}
      <Erreur erreur={erreurDoc ? new Error(erreurDoc) : null} />

      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-iss-gray pointer-events-none" />
          <input value={recherche} onChange={e => { setRecherche(e.target.value); setPage(1); }}
                 placeholder="Nom ou matricule…"
                 className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm bg-white focus:outline-none focus:border-[#006633] transition-all" />
        </div>
        <select value={annee} onChange={e => { setAnnee(e.target.value); setPage(1); }}
                className={SELECT} style={{ width: 140 }}>
          {options.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <select value={niveauFiltre} onChange={e => { setNiveauFiltre(e.target.value); setPage(1); }}
                className={SELECT} style={{ width: 150 }}>
          <option value="">Tous niveaux</option>
          {NIVEAUX.map(n => <option key={n.value} value={n.value}>{n.value}</option>)}
        </select>
        <select value={classeFiltre} onChange={e => { setClasseFiltre(e.target.value); setPage(1); }}
                className={SELECT} style={{ width: 160 }}>
          <option value="">Toutes les classes</option>
          {classes.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
        </select>
        <select value={statut} onChange={e => { setStatut(e.target.value); setPage(1); }}
                className={SELECT} style={{ width: 180 }}>
          {STATUTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </div>

      {formOuvert && (
        <FormulaireInscription
          annee={annee}
          edition={edition}
          classes={classes}
          onFerme={() => setFormOuvert(false)}
          onEnregistre={(message) => { setFormOuvert(false); notifier(message); }}
          nouvelle={nouvelle}
          update={update}
        />
      )}

      <div className={`${CARTE} overflow-hidden`}>
        {isLoading && !data ? <Chargement /> : inscriptions.length === 0 ? (
          <Vide texte="Aucune inscription ne correspond à ces filtres." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold text-iss-gray uppercase tracking-wide border-b border-gray-100">
                  <th className="px-4 py-3">Étudiant</th>
                  <th className="px-4 py-3">Matricule</th>
                  <th className="px-4 py-3">Classe</th>
                  <th className="px-4 py-3">Sous-groupe</th>
                  <th className="px-4 py-3">Statut</th>
                  <th className="px-4 py-3 text-center">Redoub.</th>
                  <th className="px-4 py-3 text-right">Frais</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {inscriptions.map(i => (
                  <tr key={i.id} className={i.actif ? '' : 'opacity-55'}>
                    <td className="px-4 py-3 font-semibold text-iss-dark">{i.etudiant_nom}</td>
                    <td className="px-4 py-3 text-iss-gray">{i.etudiant_matricule}</td>
                    <td className="px-4 py-3">
                      <Badge ton={i.niveau === 'MPSI' ? 'bleu' : 'violet'}>{i.classe_nom}</Badge>
                    </td>
                    <td className="px-4 py-3 text-iss-gray">{i.sous_groupe_libelle || '—'}</td>
                    <td className="px-4 py-3"><Badge ton={tonStatut(i.statut)}>{i.statut_display}</Badge></td>
                    <td className="px-4 py-3 text-center">
                      {i.nb_redoublements > 0
                        ? <Badge ton="ambre">{i.nb_redoublements}</Badge>
                        : <span className="text-iss-gray">—</span>}
                    </td>
                    {/* Le montant vient de la grille tarifaire et a été figé à
                        l'inscription : il dit ce qui a été facturé, pas le tarif
                        du jour. */}
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <span className="text-iss-dark">{montantFrais(i.montant_frais)}</span>
                      {i.est_payee
                        ? <Badge ton="vert">Payé</Badge>
                        : <Badge ton="ambre">Dû</Badge>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {!i.est_payee && (
                          <button onClick={() => setPaiement(i)} title="Enregistrer le paiement"
                                  className="p-2 rounded-lg text-iss-gray hover:bg-gray-100 hover:text-[#006633] transition-colors">
                            <Wallet size={13} />
                          </button>
                        )}
                        {i.est_payee && (
                          <button onClick={() => telecharger('recu', i)} title="Reçu de paiement"
                                  className="p-2 rounded-lg text-iss-gray hover:bg-gray-100 hover:text-[#006633] transition-colors">
                            <Receipt size={13} />
                          </button>
                        )}
                        <button onClick={() => telecharger('attestation', i)}
                                title="Attestation d'inscription"
                                className="p-2 rounded-lg text-iss-gray hover:bg-gray-100 hover:text-[#006633] transition-colors">
                          <FileText size={13} />
                        </button>
                        <button onClick={() => setHistorique(i)} title="Historique de classe"
                                className="p-2 rounded-lg text-iss-gray hover:bg-gray-100 hover:text-[#006633] transition-colors">
                          <History size={13} />
                        </button>
                        <button onClick={() => { setEdition(i); setFormOuvert(true); }} title="Modifier"
                                className="p-2 rounded-lg text-iss-gray hover:bg-gray-100 hover:text-[#006633] transition-colors">
                          <Pencil size={13} />
                        </button>
                        <button onClick={() => setASupprimer(i)} title="Supprimer"
                                className="p-2 rounded-lg text-iss-gray hover:bg-red-50 hover:text-red-600 transition-colors">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {(data?.pages ?? 1) > 1 && (
          <div className="px-5 pb-4">
            <Pagination page={page} pages={data?.pages ?? 1} count={total} onPage={setPage} />
          </div>
        )}
      </div>

      {historique && (
        <ModaleHistorique inscription={historique} onFerme={() => setHistorique(null)} />
      )}

      {paiement && (
        <ModalePaiement
          inscription={paiement}
          onFerme={() => setPaiement(null)}
        />
      )}

      <ConfirmModal
        open={!!aSupprimer}
        title="Supprimer l'inscription"
        message={aSupprimer
          ? `Retirer ${aSupprimer.etudiant_nom} de ${aSupprimer.classe_nom} ? Les notes déjà saisies bloquent la suppression — préférez un changement de classe pour conserver le parcours.`
          : ''}
        onConfirm={() => aSupprimer && remove.mutate(aSupprimer.id, {
          onSuccess: () => { notifier('Inscription supprimée'); setASupprimer(null); },
          onError:   () => setASupprimer(null),
        })}
        onCancel={() => setASupprimer(null)}
        loading={remove.isPending}
      />

      <Toast message={toast} />
    </div>
  );
}

// ── Formulaire d'inscription ─────────────────────────────────────────────────
type Mutation = { mutate: (v: never, o?: object) => void; isPending: boolean };

const IDENTITE_VIDE = {
  matricule: '', nom: '', prenom_fr: '', genre: 'M' as 'M' | 'F',
  date_naissance: '', lieu_naissance_fr: '', cni: '', telephone: '', email: '',
  nbac: '', serie_bac: '', moyenne_bac: '',
};

/**
 * Deux modes d'inscription :
 *  - « Nouvel étudiant » : identité + rattachement en une seule requête, donc
 *    en une seule transaction côté serveur — pas de fiche orpheline si le
 *    rattachement échoue.
 *  - « Étudiant existant » : réinscription ou reprise d'un dossier déjà au
 *    référentiel (redoublant, transfert).
 */
function FormulaireInscription({
  annee, edition, classes, onFerme, onEnregistre, nouvelle, update,
}: {
  annee: string;
  edition: Inscription | null;
  classes: { id: number; nom: string }[];
  onFerme: () => void;
  onEnregistre: (message: string) => void;
  nouvelle: Mutation;
  update: Mutation;
}) {
  const [mode, setMode] = useState<'nouveau' | 'existant'>('nouveau');
  const [identite, setIdentite] = useState(IDENTITE_VIDE);

  const [etudiantId, setEtudiantId] = useState<number | null>(edition?.etudiant ?? null);
  const [recherche, setRecherche]   = useState('');
  const [classeId, setClasseId]     = useState<number | null>(edition?.classe ?? null);
  const [sousGroupeId, setSousGroupeId] = useState<number | null>(edition?.sous_groupe ?? null);
  const [numeroOrdre, setNumeroOrdre] = useState(
    edition?.numero_ordre != null ? String(edition.numero_ordre) : '',
  );
  const [actif, setActif]   = useState(edition?.actif ?? true);
  const [erreur, setErreur] = useState<string | null>(null);

  const majIdentite = (champ: keyof typeof IDENTITE_VIDE, valeur: string) =>
    setIdentite(i => ({ ...i, [champ]: valeur }));

  // La recherche d'étudiants ne sert qu'au mode « existant » — inutile de
  // solliciter le référentiel pendant la saisie d'une nouvelle fiche.
  const { data: etudiants, isLoading: chargeEtudiants } = useQuery({
    queryKey: ['ipgei', 'etudiants-disponibles', recherche],
    queryFn:  () => listEtudiants({ search: recherche, page_size: 25 }),
    enabled:  !edition && mode === 'existant',
  });

  const { data: sousGroupes = [] } = useSousGroupes(classeId);

  const echec = (e: unknown) => setErreur(e instanceof Error ? e.message : 'Erreur');

  const enregistrer = () => {
    if (!classeId) { setErreur('Choisissez une classe.'); return; }
    setErreur(null);

    // ── Édition d'une inscription existante ────────────────────────────────
    if (edition) {
      update.mutate({
        id: edition.id,
        input: {
          classe: classeId, sous_groupe: sousGroupeId,
          numero_ordre: numeroOrdre ? Number(numeroOrdre) : null,
          actif, annee_universitaire: annee,
        },
      } as never, { onSuccess: () => onEnregistre('Inscription modifiée'), onError: echec });
      return;
    }

    const commun = {
      classe: classeId,
      sous_groupe: sousGroupeId,
      numero_ordre: numeroOrdre ? Number(numeroOrdre) : null,
    };

    if (mode === 'existant') {
      if (!etudiantId) { setErreur('Choisissez un étudiant.'); return; }
      nouvelle.mutate({ ...commun, etudiant: etudiantId } as never, {
        onSuccess: (creee: unknown) =>
          onEnregistre(messageInscription('Étudiant inscrit', creee)),
        onError: echec,
      });
      return;
    }

    if (!identite.matricule.trim()) { setErreur('Le matricule est requis.'); return; }
    if (!identite.nom.trim())       { setErreur('Le nom est requis.'); return; }

    nouvelle.mutate({
      ...commun,
      nouvel_etudiant: {
        matricule:         identite.matricule.trim(),
        nom:               identite.nom.trim(),
        prenom_fr:         identite.prenom_fr.trim(),
        genre:             identite.genre,
        // Les champs vides partent à `null` plutôt qu'en chaîne vide : une date
        // ou une moyenne vide n'est pas une valeur, c'est une absence de valeur.
        date_naissance:    identite.date_naissance || null,
        lieu_naissance_fr: identite.lieu_naissance_fr.trim(),
        cni:               identite.cni.trim() || null,
        telephone:         identite.telephone.trim(),
        email:             identite.email.trim(),
        nbac:              identite.nbac.trim() || null,
        serie_bac:         identite.serie_bac.trim(),
        moyenne_bac:       identite.moyenne_bac || null,
      },
    } as never, {
      onSuccess: (creee: unknown) =>
        onEnregistre(messageInscription('Étudiant créé et inscrit', creee)),
      onError: echec,
    });
  };

  const enCours = nouvelle.isPending || update.isPending;


  return (
    <div className={`${CARTE} p-6`} style={{ borderLeft: '3px solid #006633' }}>
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-sm font-semibold text-iss-dark">
          {edition
            ? `Modifier l'inscription de ${edition.etudiant_nom}`
            : `Nouvelle inscription — ${annee}`}
        </h3>
        <button onClick={onFerme} className="p-1 rounded-lg text-iss-gray hover:bg-gray-100 transition-colors">
          <X size={14} />
        </button>
      </div>

      {!edition && (
        <div className="flex rounded-xl border border-gray-200 overflow-hidden mb-5 w-fit">
          {([['nouveau', 'Nouvel étudiant'], ['existant', 'Étudiant déjà enregistré']] as const)
            .map(([cle, label]) => (
              <button key={cle} type="button" onClick={() => { setMode(cle); setErreur(null); }}
                      className={`px-4 py-2.5 text-sm font-semibold transition-all ${
                        mode === cle ? 'bg-[#006633] text-white' : 'bg-white text-iss-gray hover:bg-gray-50'
                      }`}>
                {label}
              </button>
            ))}
        </div>
      )}

      {/* ── Identité du nouvel étudiant ──────────────────────────────────── */}
      {!edition && mode === 'nouveau' && (
        <div className="mb-5">
          <h4 className="text-xs font-bold text-iss-dark uppercase tracking-wide mb-3">
            Identité de l&apos;étudiant
          </h4>
          <div className="grid gap-4 sm:grid-cols-4">
            <div>
              <label className="block text-xs font-semibold text-iss-dark mb-1.5">Matricule *</label>
              <input value={identite.matricule} className={INPUT} placeholder="IPG-0001" autoFocus
                     onChange={e => majIdentite('matricule', e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-iss-dark mb-1.5">Nom *</label>
              <input value={identite.nom} className={INPUT} placeholder="MOHAMED Ahmed"
                     onChange={e => majIdentite('nom', e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-iss-dark mb-1.5">Genre</label>
              <select value={identite.genre} className={SELECT}
                      onChange={e => majIdentite('genre', e.target.value)}>
                <option value="M">Masculin</option>
                <option value="F">Féminin</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-iss-dark mb-1.5">Date de naissance</label>
              <input type="date" value={identite.date_naissance} className={INPUT}
                     onChange={e => majIdentite('date_naissance', e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-iss-dark mb-1.5">Lieu de naissance</label>
              <input value={identite.lieu_naissance_fr} className={INPUT} placeholder="Nouakchott"
                     onChange={e => majIdentite('lieu_naissance_fr', e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-iss-dark mb-1.5">CNI</label>
              <input value={identite.cni} className={INPUT} placeholder="—"
                     onChange={e => majIdentite('cni', e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-iss-dark mb-1.5">Téléphone</label>
              <input value={identite.telephone} className={INPUT} placeholder="—"
                     onChange={e => majIdentite('telephone', e.target.value)} />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-iss-dark mb-1.5">Email</label>
              <input type="email" value={identite.email} className={INPUT} placeholder="—"
                     onChange={e => majIdentite('email', e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-iss-dark mb-1.5">Série du bac</label>
              <input value={identite.serie_bac} className={INPUT} placeholder="C, D…"
                     onChange={e => majIdentite('serie_bac', e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-iss-dark mb-1.5">Moyenne du bac</label>
              <input type="number" min="0" max="20" step="0.01" value={identite.moyenne_bac}
                     className={INPUT} placeholder="—"
                     onChange={e => majIdentite('moyenne_bac', e.target.value)} />
            </div>
          </div>
        </div>
      )}

      {/* ── Recherche d'un étudiant existant ─────────────────────────────── */}
      {!edition && mode === 'existant' && (
        <div className="mb-5">
          <label className="block text-xs font-semibold text-iss-dark mb-1.5">Étudiant</label>
          <input value={recherche} onChange={e => setRecherche(e.target.value)}
                 placeholder="Rechercher par nom ou matricule…" className={`${INPUT} mb-2`} autoFocus />
          <div className="max-h-52 overflow-y-auto rounded-xl border border-gray-200 divide-y divide-gray-100">
            {chargeEtudiants ? (
              <p className="px-3 py-4 text-sm text-iss-gray">Recherche…</p>
            ) : (etudiants?.results ?? []).length === 0 ? (
              <p className="px-3 py-4 text-sm text-iss-gray">
                Aucun étudiant au référentiel. Passez sur « Nouvel étudiant » pour créer
                sa fiche et l&apos;inscrire dans la foulée.
              </p>
            ) : (
              (etudiants?.results ?? []).map(e => (
                <button key={e.id} type="button" onClick={() => setEtudiantId(e.id)}
                        className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                          etudiantId === e.id ? 'bg-[#006633]/10 font-semibold text-[#006633]' : 'hover:bg-gray-50'
                        }`}>
                  {e.nom} <span className="text-iss-gray">· {e.matricule}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {/* ── Rattachement ─────────────────────────────────────────────────── */}
      <h4 className="text-xs font-bold text-iss-dark uppercase tracking-wide mb-3">
        Affectation
      </h4>
      <div className="grid gap-4 sm:grid-cols-4">
        <div>
          <label className="block text-xs font-semibold text-iss-dark mb-1.5">Classe *</label>
          <select value={classeId ?? ''} className={SELECT}
                  onChange={e => {
                    setClasseId(e.target.value ? Number(e.target.value) : null);
                    // Le sous-groupe appartient à la classe : il ne survit pas au changement.
                    setSousGroupeId(null);
                  }}>
            <option value="">Choisir…</option>
            {classes.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-iss-dark mb-1.5">Sous-groupe de TP</label>
          <select value={sousGroupeId ?? ''} className={SELECT} disabled={!classeId || sousGroupes.length === 0}
                  onChange={e => setSousGroupeId(e.target.value ? Number(e.target.value) : null)}>
            <option value="">{sousGroupes.length === 0 ? 'Aucun sous-groupe' : 'Aucun'}</option>
            {sousGroupes.map(sg => <option key={sg.id} value={sg.id}>{sg.libelle}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-iss-dark mb-1.5">
            N° d&apos;ordre <span className="font-normal text-iss-gray">(listes)</span>
          </label>
          <input type="number" min={1} value={numeroOrdre} className={INPUT} placeholder="—"
                 onChange={e => setNumeroOrdre(e.target.value)} />
        </div>
        {edition && (
          <div className="flex items-end pb-2">
            <label className="flex items-center gap-2 text-sm text-iss-dark cursor-pointer">
              <input type="checkbox" checked={actif} onChange={e => setActif(e.target.checked)}
                     className="w-4 h-4 accent-[#006633]" />
              Inscription active
            </label>
          </div>
        )}
      </div>

      {erreur && <p className="mt-3 text-sm text-red-600">{erreur}</p>}

      <div className="flex gap-2 mt-5">
        <button onClick={enregistrer} disabled={enCours}
                className={BTN_PRIMAIRE} style={{ background: DEGRADE }}>
          {edition ? 'Enregistrer' : mode === 'nouveau' ? 'Créer et inscrire' : 'Inscrire'}
        </button>
        <button onClick={onFerme} className={BTN_SECONDAIRE}>Annuler</button>
      </div>
    </div>
  );
}

// ── Historique des classes ───────────────────────────────────────────────────
function ModaleHistorique({
  inscription, onFerme,
}: { inscription: Inscription; onFerme: () => void }) {
  const { data = [], isLoading } = useHistoriqueClasses(inscription.id);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
         onClick={onFerme} role="presentation">
      <div className={`${CARTE} w-full max-w-lg p-6`} onClick={e => e.stopPropagation()} role="presentation">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-bold text-iss-dark">Parcours de {inscription.etudiant_nom}</h3>
            <p className="text-xs text-iss-gray">Changements de classe — notes et absences suivent l&apos;étudiant.</p>
          </div>
          <button onClick={onFerme} className="p-1 rounded-lg text-iss-gray hover:bg-gray-100 transition-colors">
            <X size={14} />
          </button>
        </div>

        {isLoading ? <Chargement /> : data.length === 0 ? (
          <p className="py-6 text-sm text-iss-gray text-center">
            Aucun changement de classe — inscription d&apos;origine en {inscription.classe_nom}.
          </p>
        ) : (
          <ul className="space-y-2">
            {data.map(h => (
              <li key={h.id} className="p-3 rounded-xl border border-gray-100 bg-gray-50">
                <div className="text-sm font-semibold text-iss-dark">
                  {h.classe_avant_nom} → {h.classe_apres_nom}
                </div>
                <div className="text-xs text-iss-gray mt-0.5">
                  {new Date(h.date_effet).toLocaleDateString('fr-FR')}
                  {h.decide_par_nom && ` · décidé par ${h.decide_par_nom}`}
                </div>
                {h.motif && <p className="text-xs text-iss-gray mt-1 italic">{h.motif}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}


/**
 * Enregistrement du règlement.
 *
 * Le montant n'y est pas saisissable : il vient de la grille tarifaire et a
 * été figé à l'inscription. Le rendre modifiable ici ouvrirait un écart
 * silencieux entre ce qui est facturé et ce qui est tarifé.
 */
function ModalePaiement({ inscription, onFerme }: {
  inscription: Inscription;
  onFerme: () => void;
}) {
  const { payer } = useInscriptionMutations();
  const [reference, setReference] = useState('');
  const [date, setDate]           = useState('');
  const [erreur, setErreur]       = useState<string | null>(null);

  const valider = () => {
    if (!reference.trim()) { setErreur('La référence du versement est requise.'); return; }
    payer.mutate(
      { id: inscription.id, input: { recu_paiement: reference.trim(), date_paiement: date || undefined } },
      {
        onSuccess: onFerme,
        onError: (e) => setErreur(e instanceof Error ? e.message : 'Erreur'),
      },
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className={`${CARTE} p-6 w-full`} style={{ maxWidth: 460 }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-iss-dark">Enregistrer le paiement</h3>
          <button onClick={onFerme} className="p-1.5 rounded-lg text-iss-gray hover:bg-gray-100">
            <X size={14} />
          </button>
        </div>

        <div className="text-xs text-iss-gray mb-4">
          {inscription.etudiant_nom} · {inscription.classe_nom}
        </div>

        <div className="rounded-xl bg-gray-50 border border-gray-200 px-4 py-3 mb-4 text-center">
          <div className="text-xs text-iss-gray mb-1">Montant dû</div>
          <div className="text-lg font-bold" style={{ color: '#006633' }}>
            {montantFrais(inscription.montant_frais)}
          </div>
        </div>

        <label className="block text-xs font-semibold text-iss-dark mb-1.5">
          Référence du versement
        </label>
        <input value={reference} onChange={e => setReference(e.target.value)}
               placeholder="Numéro de reçu, référence bancaire…" className={INPUT} />

        <label className="block text-xs font-semibold text-iss-dark mb-1.5 mt-3">
          Date du versement <span className="font-normal text-iss-gray">(aujourd\'hui si vide)</span>
        </label>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} className={INPUT} />

        {erreur && <p className="text-xs text-red-600 mt-3">{erreur}</p>}

        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onFerme} className={BTN_SECONDAIRE}>Annuler</button>
          <button onClick={valider} disabled={payer.isPending}
                  className={BTN_PRIMAIRE} style={{ background: DEGRADE }}>
            {payer.isPending ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  );
}
