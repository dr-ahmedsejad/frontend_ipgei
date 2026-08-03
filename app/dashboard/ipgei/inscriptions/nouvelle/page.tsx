'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertCircle, ArrowLeft, ArrowRight, Check, Loader2, UserPlus,
} from 'lucide-react';

import Stepper from '@/components/ui/Stepper';
import { ToastContainer, useToast } from '@/components/ui/Toast';
import { BTN_SECONDAIRE, CARTE, INPUT, SELECT } from '../../_ui';
import { anneeParDefaut } from '../../_annee';
import { useClassesSelect, useInscriptionMutations, useSousGroupes } from '@/lib/api/ipgei-hooks';
import { useContexteFrais, useGrillesFrais } from '@/lib/api/ipgei-frais';
import type { NouvelEtudiant } from '@/types/ipgei';

const ETAPES = [
  { label: 'Identité' },
  { label: 'Académique' },
  { label: 'Confirmation' },
];

const IDENTITE_VIDE: NouvelEtudiant = {
  matricule: '', nom: '', prenom_fr: '', genre: 'M', date_naissance: '',
  lieu_naissance_fr: '', cni: '', telephone: '', email: '',
  nbac: '', serie_bac: '', moyenne_bac: '',
};

/**
 * Inscription d'un étudiant, en trois temps.
 *
 * Reprend le déroulé de SIGA — identité, académique, confirmation — avec ce
 * que la prépa change : il n'y a rien à choisir côté pédagogique. Entrer dans
 * une classe, c'est suivre toute la maquette de son niveau ; l'étape
 * académique se limite donc au rattachement, et la confirmation annonce ce qui
 * en découlera.
 */
export default function NouvelleInscriptionPage() {
  const toast  = useToast();
  const router = useRouter();
  const annee  = anneeParDefaut();

  const [etape, setEtape]       = useState(0);
  const [identite, setIdentite] = useState<NouvelEtudiant>(IDENTITE_VIDE);
  const [classeId, setClasseId] = useState<number | null>(null);
  const [sousGroupe, setSousGroupe] = useState<string>('');
  const [numeroOrdre, setNumeroOrdre] = useState<string>('');
  const [erreur, setErreur]     = useState<string | null>(null);

  const { data: classes = [] } = useClassesSelect({ annee_universitaire: annee, actif: true });
  const { data: sousGroupes = [] } = useSousGroupes(classeId);
  const { data: contexte }     = useContexteFrais();
  const { data: tarifs = [] }  = useGrillesFrais();
  const { nouvelle }           = useInscriptionMutations();

  const classe = classes.find(c => c.id === classeId);

  /** Le montant que portera l'inscription — lu dans la grille, comme au serveur. */
  const montant = useMemo(() => {
    if (!classe || !contexte) return null;
    const niveau = classe.niveau === 'MPSI' ? 1 : 2;
    const t = tarifs.find(
      x => x.niveau === niveau && x.actif && x.type_diplome === contexte.type_diplome,
    );
    return t ? Number(t.montant) : null;
  }, [classe, contexte, tarifs]);

  const majIdentite = (champ: keyof NouvelEtudiant, valeur: string) =>
    setIdentite(i => ({ ...i, [champ]: valeur }));

  const suivant = () => {
    setErreur(null);
    if (etape === 0) {
      if (!identite.matricule.trim()) { setErreur('Le matricule est requis.'); return; }
      if (!identite.nom.trim())       { setErreur('Le nom est requis.'); return; }
    }
    if (etape === 1 && !classeId) { setErreur('Choisissez une classe.'); return; }
    setEtape(e => e + 1);
  };

  const enregistrer = () => {
    setErreur(null);
    nouvelle.mutate(
      {
        classe: classeId!,
        sous_groupe: sousGroupe ? Number(sousGroupe) : null,
        numero_ordre: numeroOrdre ? Number(numeroOrdre) : null,
        nouvel_etudiant: {
          ...identite,
          matricule: identite.matricule.trim(),
          nom:       identite.nom.trim(),
          // Une date, une moyenne ou un numéro vides ne sont pas des valeurs :
          // les envoyer en chaîne vide ferait échouer la validation du serveur.
          date_naissance: identite.date_naissance || null,
          cni:            identite.cni || null,
          nbac:           identite.nbac || null,
          moyenne_bac:    identite.moyenne_bac || null,
        },
      } as never,
      {
        onSuccess: (creee: unknown) => {
          const n = (creee as { matieres_inscrites?: number })?.matieres_inscrites ?? 0;
          toast.success(
            `Étudiant inscrit${n ? ` · ${n} matière${n > 1 ? 's' : ''} rattachée${n > 1 ? 's' : ''}` : ''}`,
          );
          router.push('/dashboard/ipgei/inscriptions');
        },
        onError: (e) => setErreur(e instanceof Error ? e.message : 'Inscription impossible.'),
      },
    );
  };

  return (
    <div className="max-w-4xl mx-auto space-y-5 p-2">
      <ToastContainer toasts={toast.toasts} onClose={toast.removeToast} />

      <div className="flex items-center gap-3">
        <Link href="/dashboard/ipgei/inscriptions"
              className="p-2 rounded-xl text-iss-gray hover:bg-gray-50 hover:text-iss-primary transition-colors">
          <ArrowLeft size={18} />
        </Link>
        <div className="w-10 h-10 rounded-xl flex items-center justify-center"
             style={{ background: 'linear-gradient(135deg, #004d24, #006633)' }}>
          <UserPlus size={20} className="text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-iss-dark">Nouvelle inscription</h1>
          <p className="text-sm text-iss-gray">Année universitaire {annee}</p>
        </div>
      </div>

      <Stepper steps={ETAPES} currentStep={etape} />

      <div className={`${CARTE} p-5 space-y-4`}>
        {etape === 0 && (
          <>
            <h2 className="font-semibold text-iss-dark">Identité de l&apos;étudiant</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <Champ label="Matricule *">
                <input value={identite.matricule} className={INPUT}
                       onChange={e => majIdentite('matricule', e.target.value)} />
              </Champ>
              <Champ label="Nom *">
                <input value={identite.nom} className={INPUT}
                       onChange={e => majIdentite('nom', e.target.value)} />
              </Champ>
              <Champ label="Prénom">
                <input value={identite.prenom_fr ?? ''} className={INPUT}
                       onChange={e => majIdentite('prenom_fr', e.target.value)} />
              </Champ>
              <Champ label="Genre">
                <select value={identite.genre ?? 'M'} className={SELECT}
                        onChange={e => majIdentite('genre', e.target.value)}>
                  <option value="M">Masculin</option>
                  <option value="F">Féminin</option>
                </select>
              </Champ>
              <Champ label="Date de naissance">
                <input type="date" value={identite.date_naissance ?? ''} className={INPUT}
                       onChange={e => majIdentite('date_naissance', e.target.value)} />
              </Champ>
              <Champ label="Lieu de naissance">
                <input value={identite.lieu_naissance_fr ?? ''} className={INPUT}
                       onChange={e => majIdentite('lieu_naissance_fr', e.target.value)} />
              </Champ>
              <Champ label="CNI">
                <input value={identite.cni ?? ''} className={INPUT}
                       onChange={e => majIdentite('cni', e.target.value)} />
              </Champ>
              <Champ label="Téléphone">
                <input value={identite.telephone ?? ''} className={INPUT}
                       onChange={e => majIdentite('telephone', e.target.value)} />
              </Champ>
              <Champ label="Email">
                <input type="email" value={identite.email ?? ''} className={INPUT}
                       onChange={e => majIdentite('email', e.target.value)} />
              </Champ>
              <Champ label="N° baccalauréat">
                <input value={identite.nbac ?? ''} className={INPUT}
                       onChange={e => majIdentite('nbac', e.target.value)} />
              </Champ>
              <Champ label="Série du bac">
                <input value={identite.serie_bac ?? ''} className={INPUT}
                       onChange={e => majIdentite('serie_bac', e.target.value)} />
              </Champ>
              <Champ label="Moyenne du bac">
                <input type="number" step="0.01" value={identite.moyenne_bac ?? ''} className={INPUT}
                       onChange={e => majIdentite('moyenne_bac', e.target.value)} />
              </Champ>
            </div>
          </>
        )}

        {etape === 1 && (
          <>
            <h2 className="font-semibold text-iss-dark">Rattachement</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Champ label="Classe *">
                <select value={classeId ?? ''} className={SELECT}
                        onChange={e => {
                          setClasseId(e.target.value ? Number(e.target.value) : null);
                          setSousGroupe('');
                        }}>
                  <option value="">— Choisir —</option>
                  {classes.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
                </select>
              </Champ>
              <Champ label="Sous-groupe">
                <select value={sousGroupe} className={SELECT} disabled={!sousGroupes.length}
                        onChange={e => setSousGroupe(e.target.value)}>
                  <option value="">Aucun</option>
                  {sousGroupes.map(sg => (
                    <option key={sg.id} value={sg.id}>{sg.libelle}</option>
                  ))}
                </select>
              </Champ>
              <Champ label="N° d'ordre">
                <input type="number" value={numeroOrdre} className={INPUT}
                       onChange={e => setNumeroOrdre(e.target.value)} />
              </Champ>
            </div>

            {/* Il n'y a pas d'étape « inscription pédagogique » : la maquette
                du niveau s'applique entière. Le dire ici évite de chercher où
                choisir les matières. */}
            <p className="text-xs text-iss-gray">
              Aucune matière à choisir : l&apos;étudiant sera inscrit à toute la maquette
              de son niveau, sur les deux semestres de l&apos;année.
            </p>
          </>
        )}

        {etape === 2 && (
          <>
            <h2 className="font-semibold text-iss-dark">Confirmation</h2>
            <dl className="text-sm divide-y divide-gray-100">
              <Ligne cle="Étudiant" valeur={`${identite.nom} ${identite.prenom_fr ?? ''}`.trim()} />
              <Ligne cle="Matricule" valeur={identite.matricule} />
              <Ligne cle="Classe" valeur={classe?.nom ?? '—'} />
              <Ligne cle="Sous-groupe"
                     valeur={sousGroupes.find(sg => String(sg.id) === sousGroupe)?.libelle ?? 'Aucun'} />
              <Ligne cle="Année universitaire" valeur={annee} />
              <Ligne
                cle="Frais d'inscription"
                valeur={montant !== null
                  ? `${montant.toLocaleString('fr-FR')} MRU`
                  : 'Aucun tarif défini — l’inscription sera créée à 0'}
              />
            </dl>

            {montant === null && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 flex items-start gap-2">
                <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
                <span>
                  Aucun tarif n&apos;est défini pour ce niveau. L&apos;inscription sera
                  enregistrée à 0 MRU — corrigez la{' '}
                  <Link href="/dashboard/ipgei/inscriptions/frais"
                        className="font-semibold underline underline-offset-2">
                    grille tarifaire
                  </Link>{' '}
                  avant de poursuivre si ce n&apos;est pas voulu.
                </span>
              </p>
            )}
          </>
        )}

        {erreur && <p className="text-xs text-red-600">{erreur}</p>}

        <div className="flex items-center justify-between pt-2">
          <button onClick={() => setEtape(e => Math.max(0, e - 1))}
                  disabled={etape === 0} className={BTN_SECONDAIRE}>
            <ArrowLeft size={14} /> Retour
          </button>

          {etape < 2 ? (
            <button onClick={suivant}
                    className="px-4 py-2 rounded-xl text-sm font-bold text-white flex items-center gap-1.5 hover:opacity-90 transition-all"
                    style={{ background: 'linear-gradient(135deg, #006633, #008844)' }}>
              Continuer <ArrowRight size={14} />
            </button>
          ) : (
            <button onClick={enregistrer} disabled={nouvelle.isPending}
                    className="px-4 py-2 rounded-xl text-sm font-bold text-white flex items-center gap-1.5 disabled:opacity-50 hover:opacity-90 transition-all"
                    style={{ background: 'linear-gradient(135deg, #006633, #008844)' }}>
              {nouvelle.isPending
                ? <><Loader2 size={14} className="animate-spin" /> Inscription…</>
                : <><Check size={14} /> Inscrire</>}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Champ({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-medium text-slate-600 mb-1 block">{label}</label>
      {children}
    </div>
  );
}

function Ligne({ cle, valeur }: { cle: string; valeur: string }) {
  return (
    <div className="flex justify-between py-2">
      <dt className="text-iss-gray">{cle}</dt>
      <dd className="font-semibold text-iss-dark text-right">{valeur}</dd>
    </div>
  );
}
