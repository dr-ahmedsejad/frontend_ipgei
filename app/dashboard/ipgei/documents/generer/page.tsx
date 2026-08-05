'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, CheckCircle2, Download, FileBadge, Loader2, Lock, Search,
} from 'lucide-react';

import Stepper from '@/components/ui/Stepper';
import { canAccess } from '@/lib/auth';
import { downloadBlob } from '@/lib/downloadBlob';
import {
  BTN_PRIMAIRE, BTN_SECONDAIRE, CARTE, Chargement, DEGRADE, EnTetePage, SELECT,
} from '../../_ui';
import { useAnneeIPGEI } from '../../_annee';
import {
  useClassesSelect, useDeliberations, useDocumentMutations, useInscriptions,
  useSemestresAll,
} from '@/lib/api/ipgei-hooks';
import type { Inscription } from '@/types/ipgei';

/**
 * Génération d'un document officiel, en quatre temps.
 *
 * L'écran précédent posait deux boutons — relevé de semestre, relevé annuel —
 * au-dessus du registre : quatre des six documents que le serveur sait produire
 * n'étaient atteignables que depuis l'écran de délibération ou celui des
 * inscriptions, et rien ne disait où. Le parcours guidé les réunit, et sépare
 * l'émission de la consultation.
 *
 * Reprend la conduite de SIGA (« Documents → Générer ») : mêmes étapes, mêmes
 * cartes à cocher, même verrou par droit.
 */

const ETAPES = [
  { label: 'Étudiant' },
  { label: 'Type de document' },
  { label: 'Paramètres' },
  { label: 'Génération' },
];

type CleDocument =
  | 'attestation_inscription' | 'releve_semestre' | 'releve_annuel'
  | 'decision_deliberation'   | 'attestation_cnim' | 'recu_paiement';

interface TypeDocument {
  cle:       CleDocument;
  label:     string;
  detail:    string;
  /** Ce qu'il faut choisir en plus de l'étudiant. */
  besoin:    'aucun' | 'semestre' | 'deliberation';
  /** Droit exigé pour l'émettre. */
  module:    string;
}

const TYPES: TypeDocument[] = [
  {
    cle: 'attestation_inscription', label: "Attestation d'inscription",
    detail: "Scolarité de l'année en cours, avec la maquette des deux semestres.",
    besoin: 'aucun', module: 'ipgei_documents',
  },
  {
    cle: 'releve_semestre', label: 'Relevé de semestre',
    detail: 'Notes et moyennes du semestre choisi.',
    besoin: 'semestre', module: 'ipgei_documents',
  },
  {
    cle: 'releve_annuel', label: 'Relevé annuel',
    detail: "Les deux semestres de l'année sur un seul document.",
    besoin: 'aucun', module: 'ipgei_documents',
  },
  {
    cle: 'decision_deliberation', label: 'Décision de délibération',
    detail: 'Décision prononcée par le jury — exige une délibération validée.',
    besoin: 'deliberation', module: 'ipgei_deliberation',
  },
  {
    cle: 'attestation_cnim', label: 'Attestation CNIM',
    detail: 'Autorisation à concourir, pour les admis de deuxième année.',
    besoin: 'deliberation', module: 'ipgei_deliberation',
  },
  {
    cle: 'recu_paiement', label: 'Reçu des frais',
    detail: "Refusé tant que le paiement n'est pas enregistré.",
    besoin: 'aucun', module: 'ipgei_documents',
  },
];

export default function GenererDocumentIPGEIPage() {
  const { annee, setAnnee, options } = useAnneeIPGEI();

  const [etape, setEtape] = useState(0);
  const [inscription, setInscription] = useState<Inscription | null>(null);
  const [type, setType]               = useState<CleDocument | ''>('');
  const [semestreId, setSemestreId]   = useState<number | null>(null);
  const [deliberationId, setDeliberationId] = useState<number | null>(null);
  const [erreur, setErreur]   = useState<string | null>(null);
  const [emis, setEmis]       = useState<string | null>(null);

  const choisi = TYPES.find(t => t.cle === type) ?? null;
  const mutations = useDocumentMutations();

  const { data: semestres = [] } = useSemestresAll({ annee_universitaire: annee });
  const { data: deliberationsPage } = useDeliberations({
    annee_universitaire: annee || '__aucune__',
    niveau: inscription?.niveau,
    statut: 'validee',
  });
  const deliberations = deliberationsPage?.results ?? [];

  // Un semestre appartient à une année d'étude : on ne propose que ceux que
  // suit le niveau de l'étudiant.
  const semestresDuNiveau = inscription
    ? semestres.filter(s => s.niveaux.includes(inscription.niveau))
    : [];

  const enCours = Object.values(mutations).some(m => m.isPending);

  const reinitialiser = () => {
    setEtape(0); setInscription(null); setType('');
    setSemestreId(null); setDeliberationId(null); setEmis(null); setErreur(null);
  };

  const parametreManquant =
    (choisi?.besoin === 'semestre'     && !semestreId) ||
    (choisi?.besoin === 'deliberation' && !deliberationId);

  const emettre = () => {
    if (!inscription || !choisi) return;
    setErreur(null);
    const nom = inscription.etudiant_matricule || 'document';
    const reussi = (suffixe: string) => (blob: Blob) => {
      downloadBlob(blob, `${suffixe}-${nom}.pdf`);
      setEmis(choisi.label);
      setEtape(3);
    };
    const echoue = (e: unknown) => setErreur(e instanceof Error ? e.message : 'Erreur');
    const options = (suffixe: string) => ({ onSuccess: reussi(suffixe), onError: echoue });

    switch (choisi.cle) {
      case 'attestation_inscription':
        return mutations.attestationInscription.mutate(inscription.id, options('attestation'));
      case 'releve_semestre':
        return mutations.releveSemestre.mutate(
          { inscription: inscription.id, semestre: semestreId as number }, options('releve'));
      case 'releve_annuel':
        return mutations.releveAnnuel.mutate(inscription.id, options('releve-annuel'));
      case 'decision_deliberation':
        return mutations.decision.mutate(
          { deliberation: deliberationId as number, inscription: inscription.id }, options('decision'));
      case 'attestation_cnim':
        return mutations.attestationCnim.mutate(
          { deliberation: deliberationId as number, inscription: inscription.id }, options('cnim'));
      case 'recu_paiement':
        return mutations.recuPaiement.mutate(inscription.id, options('recu'));
    }
  };

  return (
    <div className="space-y-5 max-w-3xl">
      <Link href="/dashboard/ipgei/documents"
            className="inline-flex items-center gap-1.5 text-sm text-iss-gray hover:text-[#006633] transition-colors">
        <ArrowLeft size={14} /> Registre des documents
      </Link>

      <EnTetePage
        icone={<FileBadge size={14} className="text-white" />}
        titre="Générer un document"
        sousTitre="Chaque émission crée une pièce numérotée au registre, avec son QR de vérification."
        actions={
          <select value={annee} onChange={e => setAnnee(e.target.value)}
                  className={SELECT} style={{ width: 140 }}>
            {options.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        }
      />

      <Stepper steps={ETAPES} currentStep={etape} />

      <div className={`${CARTE} p-6`}>
        {etape === 0 && (
          <ChoixEtudiant
            annee={annee} choisi={inscription}
            onChoisir={i => { setInscription(i); setSemestreId(null); setDeliberationId(null); }}
            onSuivant={() => setEtape(1)}
          />
        )}

        {etape === 1 && (
          <ChoixType
            type={type} onType={t => { setType(t); setSemestreId(null); setDeliberationId(null); }}
            onRetour={() => setEtape(0)} onSuivant={() => setEtape(2)}
          />
        )}

        {etape === 2 && choisi && inscription && (
          <Parametres
            inscription={inscription} choisi={choisi}
            semestres={semestresDuNiveau} semestreId={semestreId} onSemestre={setSemestreId}
            deliberations={deliberations} deliberationId={deliberationId} onDeliberation={setDeliberationId}
            manquant={!!parametreManquant} enCours={enCours} erreur={erreur}
            onRetour={() => setEtape(1)} onEmettre={emettre}
          />
        )}

        {etape === 3 && (
          <div className="text-center py-6 space-y-3">
            <CheckCircle2 size={40} className="mx-auto text-[#006633]" />
            <p className="text-sm font-bold text-iss-dark">{emis} émis</p>
            <p className="text-xs text-iss-gray">
              Le téléchargement a démarré. La pièce est inscrite au registre, où elle
              reste consultable et vérifiable.
            </p>
            <div className="flex gap-2 justify-center pt-2">
              <button onClick={reinitialiser} className={BTN_PRIMAIRE} style={{ background: DEGRADE }}>
                Générer un autre document
              </button>
              <Link href="/dashboard/ipgei/documents" className={BTN_SECONDAIRE}>
                Voir le registre
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Étape 0 ──────────────────────────────────────────────────────────────────
function ChoixEtudiant({ annee, choisi, onChoisir, onSuivant }: {
  annee: string; choisi: Inscription | null;
  onChoisir: (i: Inscription) => void; onSuivant: () => void;
}) {
  const [classe, setClasse]       = useState('');
  const [recherche, setRecherche] = useState('');

  const { data: classes = [] } = useClassesSelect({ annee_universitaire: annee, actif: true });
  const { data: page, isLoading } = useInscriptions({
    page: 1, annee_universitaire: annee || '__aucune__',
    classe: classe ? Number(classe) : undefined,
    search: recherche || undefined, actif: true,
  });
  const inscriptions = page?.results ?? [];

  return (
    <div className="space-y-4">
      <h2 className="font-semibold text-iss-dark">Sélectionner l&apos;étudiant</h2>

      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="block text-xs font-semibold text-iss-dark mb-1.5">Classe</label>
          <select value={classe} className={SELECT} onChange={e => setClasse(e.target.value)}>
            <option value="">Toutes</option>
            {classes.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-semibold text-iss-dark mb-1.5">Rechercher</label>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-iss-gray pointer-events-none" />
            <input value={recherche} onChange={e => setRecherche(e.target.value)}
                   placeholder="Nom ou matricule…"
                   className="w-full h-11 pl-9 pr-4 rounded-xl border border-gray-200 text-sm bg-white focus:outline-none focus:border-[#006633] transition-all" />
          </div>
        </div>
      </div>

      {isLoading ? <Chargement /> : (
        <div className="max-h-64 overflow-y-auto rounded-xl border border-gray-200 divide-y divide-gray-100">
          {inscriptions.length === 0 ? (
            <p className="px-4 py-5 text-sm text-iss-gray">Aucune inscription pour ces critères.</p>
          ) : inscriptions.map(i => (
            <button key={i.id} type="button" onClick={() => onChoisir(i)}
                    className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                      choisi?.id === i.id
                        ? 'bg-[#006633]/8 font-semibold text-[#006633]'
                        : 'hover:bg-gray-50'}`}>
              {i.etudiant_nom}
              <span className="text-iss-gray"> · {i.etudiant_matricule} · {i.classe_nom}</span>
            </button>
          ))}
        </div>
      )}

      <div className="flex justify-end pt-1">
        <button onClick={onSuivant} disabled={!choisi}
                className={BTN_PRIMAIRE} style={{ background: DEGRADE }}>
          Suivant →
        </button>
      </div>
    </div>
  );
}

// ── Étape 1 ──────────────────────────────────────────────────────────────────
function ChoixType({ type, onType, onRetour, onSuivant }: {
  type: CleDocument | ''; onType: (t: CleDocument) => void;
  onRetour: () => void; onSuivant: () => void;
}) {
  return (
    <div className="space-y-4">
      <h2 className="font-semibold text-iss-dark">Type de document</h2>

      <div className="space-y-2">
        {TYPES.map(t => {
          // Le droit se vérifie ici comme il le sera au serveur : une carte
          // qu'on ne peut pas émettre se voit, verrouillée, plutôt que de
          // disparaître sans explication.
          const autorise = canAccess(t.module, 'modifier');
          return (
            <label key={t.cle}
                   title={autorise ? undefined : "Vous n'avez pas le droit d'émettre ce document."}
                   className={`flex items-center gap-3 p-3.5 rounded-xl border transition-colors ${
                     !autorise ? 'border-gray-100 bg-gray-50 cursor-not-allowed opacity-60'
                     : type === t.cle ? 'border-[#006633] bg-[#006633]/5 cursor-pointer'
                     : 'border-gray-200 hover:border-gray-300 cursor-pointer'}`}>
              <input type="radio" name="type_document" value={t.cle}
                     disabled={!autorise} checked={type === t.cle}
                     onChange={() => onType(t.cle)}
                     className="w-4 h-4 accent-[#006633]" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-iss-dark">{t.label}</p>
                <p className="text-xs text-iss-gray leading-relaxed">{t.detail}</p>
              </div>
              {!autorise && <Lock size={14} className="text-gray-400 flex-shrink-0" />}
            </label>
          );
        })}
      </div>

      <div className="flex justify-between pt-1">
        <button onClick={onRetour} className={BTN_SECONDAIRE}>← Retour</button>
        <button onClick={onSuivant} disabled={!type}
                className={BTN_PRIMAIRE} style={{ background: DEGRADE }}>
          Suivant →
        </button>
      </div>
    </div>
  );
}

// ── Étape 2 ──────────────────────────────────────────────────────────────────
function Parametres({
  inscription, choisi, semestres, semestreId, onSemestre,
  deliberations, deliberationId, onDeliberation,
  manquant, enCours, erreur, onRetour, onEmettre,
}: {
  inscription: Inscription; choisi: TypeDocument;
  semestres: { id: number; code: string; libelle_annee: string }[];
  semestreId: number | null; onSemestre: (v: number | null) => void;
  deliberations: { id: number; libelle: string; niveau: string; portee: string }[];
  deliberationId: number | null; onDeliberation: (v: number | null) => void;
  manquant: boolean; enCours: boolean; erreur: string | null;
  onRetour: () => void; onEmettre: () => void;
}) {
  return (
    <div className="space-y-4">
      <h2 className="font-semibold text-iss-dark">Paramètres du document</h2>

      <div className="p-3 rounded-xl bg-gray-50 border border-gray-100 text-sm">
        <span className="text-iss-gray">Étudiant :</span>{' '}
        <span className="font-medium text-iss-dark">{inscription.etudiant_nom}</span>
        <span className="mx-2 text-gray-300">|</span>
        <span className="text-iss-gray">Document :</span>{' '}
        <span className="font-medium text-iss-dark">{choisi.label}</span>
      </div>

      {choisi.besoin === 'semestre' && (
        <div>
          <label className="block text-xs font-semibold text-iss-dark mb-1.5">
            Semestre <span className="text-red-600">*</span>
          </label>
          <select value={semestreId ?? ''} className={SELECT}
                  onChange={e => onSemestre(e.target.value ? Number(e.target.value) : null)}>
            <option value="">— Choisir —</option>
            {semestres.map(s => (
              <option key={s.id} value={s.id}>{s.code} — {s.libelle_annee}</option>
            ))}
          </select>
        </div>
      )}

      {choisi.besoin === 'deliberation' && (
        <div>
          <label className="block text-xs font-semibold text-iss-dark mb-1.5">
            Délibération <span className="text-red-600">*</span>
          </label>
          {deliberations.length === 0 ? (
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-4 py-2.5">
              Aucune délibération validée pour {inscription.niveau} cette année. Un document
              de jury ne s&apos;émet qu&apos;une fois la délibération close.
            </p>
          ) : (
            <select value={deliberationId ?? ''} className={SELECT}
                    onChange={e => onDeliberation(e.target.value ? Number(e.target.value) : null)}>
              <option value="">— Choisir —</option>
              {deliberations.map(d => (
                <option key={d.id} value={d.id}>
                  {d.libelle || `${d.niveau} — ${d.portee}`}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {choisi.besoin === 'aucun' && (
        <p className="text-xs text-iss-gray">
          Aucun paramètre supplémentaire : ce document se déduit de l&apos;inscription.
        </p>
      )}

      {erreur && <p className="text-sm text-red-600">{erreur}</p>}

      <div className="flex justify-between pt-1">
        <button onClick={onRetour} className={BTN_SECONDAIRE}>← Retour</button>
        <button onClick={onEmettre} disabled={manquant || enCours}
                className={BTN_PRIMAIRE} style={{ background: DEGRADE }}>
          {enCours ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
          {enCours ? 'Émission…' : 'Émettre le document'}
        </button>
      </div>
    </div>
  );
}
