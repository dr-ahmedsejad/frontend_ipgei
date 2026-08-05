'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertCircle, ArrowLeft, ArrowRight, Check, GraduationCap, Loader2, Search,
  Upload, UserPlus,
} from 'lucide-react';
import { useMutation, useQuery } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api';

import BilingualInput from '@/components/ui/BilingualInput';
import Stepper from '@/components/ui/Stepper';
import { ToastContainer, useToast } from '@/components/ui/Toast';
import { BTN_SECONDAIRE, CARTE, INPUT, SELECT } from '../../_ui';
import { anneeParDefaut } from '../../_annee';
import { useClassesSelect, useInscriptionMutations } from '@/lib/api/ipgei-hooks';
import { useContexteFrais, useGrillesFrais } from '@/lib/api/ipgei-frais';
import type { NouvelEtudiant } from '@/types/ipgei';

const ETAPES = [
  { label: 'Identité' },
  { label: 'Académique' },
  { label: 'Confirmation' },
];

/** Un bachelier du référentiel officiel, tel que le socle le stocke. */
interface CandidatBac {
  id:             number;
  nni:            string;
  num_bac:        string;
  nom_fr:         string;
  date_naissance: string | null;
  lieu_naissance: string;
  sexe:           string;
  serie:          string;
  moyenne:        string | null;
  mention:        string;
  wilaya:         string;
  inscrit:        boolean;
}

type Voie = 'formulaire' | 'bac' | 'mers';

/** Ce que l'import rend : le détail compte autant que le total. */
interface RapportImport {
  inscriptions_creees: number;
  deja_inscrits:       number;
  montant_applique:    string;
  erreurs:             { ligne: number; etudiant?: string; motif: string }[];
}

// `nom` porte le nom COMPLET, prénoms inclus : c'est la forme du référentiel
// officiel et celle du fichier MESRS, où l'état civil n'est pas scindé. Séparer
// nom et prénom obligerait à trancher une coupure que la source ne donne pas.
const IDENTITE_VIDE: NouvelEtudiant = {
  matricule: '', nom: '', nom_ar: '', genre: 'M', date_naissance: '',
  lieu_naissance_fr: '', lieu_naissance_ar: '', cni: '', telephone: '', email: '',
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

  const [voie, setVoie]         = useState<Voie>('formulaire');
  const [etape, setEtape]       = useState(0);
  const [recherche, setRecherche] = useState('');
  const [candidat, setCandidat]   = useState<CandidatBac | null>(null);
  const [fichier, setFichier]     = useState<File | null>(null);
  const [rapport, setRapport]     = useState<RapportImport | null>(null);
  const [identite, setIdentite] = useState<NouvelEtudiant>(IDENTITE_VIDE);
  const [classeId, setClasseId] = useState<number | null>(null);
  const [numeroOrdre, setNumeroOrdre] = useState<string>('');
  const [erreur, setErreur]     = useState<string | null>(null);

  const { data: classes = [] } = useClassesSelect({ annee_universitaire: annee, actif: true });
  const { data: contexte }     = useContexteFrais();
  const { data: tarifs = [] }  = useGrillesFrais();
  const { nouvelle }           = useInscriptionMutations();

  const classe = classes.find(c => c.id === classeId);

  /**
   * Vivier des bacheliers, importé par la scolarité.
   *
   * C'est la voie normale d'entrée en prépa : le candidat existe déjà au
   * référentiel officiel, avec son numéro de bac et sa moyenne. Le retaper à
   * la main, c'est risquer une faute sur les deux valeurs qui décident de
   * l'admission.
   */
  const { data: candidats = [], isFetching: chercheBac } = useQuery({
    queryKey: ['ipgei', 'candidats-bac', recherche] as const,
    queryFn:  () => apiFetch<{ results: CandidatBac[] } | CandidatBac[]>(
      '/api/v1/inscriptions/candidats-bac/',
      { params: { search: recherche, page_size: 20 } },
    ).then(r => (Array.isArray(r) ? r : r.results ?? [])),
    enabled:  voie === 'bac' && recherche.trim().length >= 2,
  });

  /** Reprend le dossier du bachelier dans le formulaire, sans ressaisie. */
  const choisirCandidat = (c: CandidatBac) => {
    setCandidat(c);
    setIdentite({
      ...IDENTITE_VIDE,
      matricule:         c.num_bac,
      nom:               c.nom_fr,
      genre:             c.sexe === 'F' ? 'F' : 'M',
      date_naissance:    c.date_naissance ?? '',
      lieu_naissance_fr: c.lieu_naissance,
      cni:               c.nni,
      nbac:              c.num_bac,
      serie_bac:         c.serie,
      moyenne_bac:       c.moyenne ?? '',
    });
    setVoie('formulaire');
    setEtape(0);
  };

  /**
   * Import du fichier officiel.
   *
   * Il passe par un endpoint propre à l'IPGEI : celui du socle crée des
   * inscriptions LMD, sans classe de prépa, sans matières et sans frais.
   */
  const importer = useMutation({
    mutationFn: async () => {
      const corps = new FormData();
      corps.append('fichier', fichier as File);
      corps.append('classe', String(classeId));
      return apiFetch<RapportImport>(
        '/api/v1/ipgei/inscriptions/importer-mesrs/',
        { method: 'POST', body: corps },
      );
    },
    onSuccess: (r) => {
      setRapport(r);
      toast.success(`${r.inscriptions_creees} inscription(s) créée(s)`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Import impossible.'),
  });

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
      if (!identite.nom.trim())       { setErreur('Le nom complet est requis.'); return; }
    }
    if (etape === 1 && !classeId) { setErreur('Choisissez une classe.'); return; }
    setEtape(e => e + 1);
  };

  const enregistrer = () => {
    setErreur(null);
    nouvelle.mutate(
      {
        classe: classeId!,
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

      {/* Trois voies d'entrée, comme dans SIGA. Le référentiel BAC alimente le
          formulaire plutôt que de le doubler : une fois le dossier repris, les
          étapes sont les mêmes, et rien n'est saisi deux fois. */}
      <div className="flex gap-1 p-1 rounded-xl bg-gray-100 w-fit">
        {([
          { cle: 'formulaire', libelle: 'Formulaire manuel', icone: UserPlus },
          { cle: 'bac',        libelle: 'Référentiel BAC',   icone: GraduationCap },
          { cle: 'mers',       libelle: 'Import MESRS',      icone: Upload },
        ] as const).map(o => (
          <button key={o.cle} type="button" onClick={() => setVoie(o.cle)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                    voie === o.cle
                      ? 'bg-white text-iss-primary shadow-sm'
                      : 'text-iss-gray hover:text-iss-dark'}`}>
            <o.icone size={15} /> {o.libelle}
          </button>
        ))}
      </div>

      {voie === 'bac' && (
        <div className={`${CARTE} p-5 space-y-3`}>
          <h2 className="font-semibold text-iss-dark">Rechercher un bachelier</h2>
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-iss-gray" />
            <input value={recherche} onChange={e => setRecherche(e.target.value)}
                   placeholder="Nom, numéro de bac ou NNI…"
                   className={`${INPUT} pl-9`} />
          </div>

          {recherche.trim().length < 2 ? (
            <p className="text-xs text-iss-gray">Saisissez au moins deux caractères.</p>
          ) : chercheBac ? (
            <p className="text-xs text-iss-gray flex items-center gap-1.5">
              <Loader2 size={13} className="animate-spin" /> Recherche…
            </p>
          ) : !candidats.length ? (
            <p className="text-xs text-iss-gray">
              Aucun bachelier trouvé. Le vivier est alimenté par l&apos;import du
              fichier officiel.
            </p>
          ) : (
            <div className="divide-y divide-gray-100">
              {candidats.map(c => (
                <button key={c.id} onClick={() => choisirCandidat(c)}
                        disabled={c.inscrit}
                        className="w-full text-left py-2.5 flex items-center justify-between hover:bg-gray-50/70 disabled:opacity-50 disabled:hover:bg-transparent">
                  <span>
                    <span className="font-semibold text-iss-dark">{c.nom_fr}</span>
                    <span className="text-xs text-iss-gray block">
                      Bac n° {c.num_bac} · série {c.serie || '—'}
                      {c.moyenne ? ` · moyenne ${c.moyenne}` : ''}
                      {c.wilaya ? ` · ${c.wilaya}` : ''}
                    </span>
                  </span>
                  {/* Un bachelier déjà inscrit ne doit pas l'être deux fois :
                      le serveur le refuserait, autant le dire avant le clic. */}
                  {c.inscrit
                    ? <span className="text-xs text-iss-gray">déjà inscrit</span>
                    : <ArrowRight size={15} className="text-iss-gray" />}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {voie === 'mers' && (
        <div className={`${CARTE} p-5 space-y-4`}>
          <h2 className="font-semibold text-iss-dark">Import du fichier officiel</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Champ label="Classe de destination *">
              <select value={classeId ?? ''} className={SELECT}
                      onChange={e => setClasseId(e.target.value ? Number(e.target.value) : null)}>
                <option value="">— Choisir —</option>
                {classes.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
              </select>
            </Champ>
            <Champ label="Fichier Excel *">
              <input type="file" accept=".xlsx,.xls" className={INPUT}
                     onChange={e => { setFichier(e.target.files?.[0] ?? null); setRapport(null); }} />
            </Champ>
          </div>

          <p className="text-xs text-iss-gray">
            Colonnes attendues : <strong>NNI</strong> et <strong>NOMFR</strong> au
            minimum. NUMBAC, SERIE, MOYENNE, DATENAIS, LIEUNAIS et SEXE sont reprises
            si elles figurent. Chaque étudiant sera inscrit à toute la maquette de son
            niveau, avec les frais en vigueur.
          </p>

          <button onClick={() => importer.mutate()}
                  disabled={!fichier || !classeId || importer.isPending}
                  className="px-4 py-2 rounded-xl text-sm font-bold text-white flex items-center gap-1.5 disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg, #006633, #008844)' }}>
            {importer.isPending
              ? <><Loader2 size={14} className="animate-spin" /> Import en cours…</>
              : <><Upload size={14} /> Importer</>}
          </button>

          {rapport && (
            <div className="space-y-2 pt-2 border-t border-gray-100">
              <p className="text-sm text-iss-dark">
                <strong>{rapport.inscriptions_creees}</strong> inscription(s) créée(s)
                {rapport.deja_inscrits > 0 && <> · {rapport.deja_inscrits} déjà inscrit(s), ignoré(s)</>}
                {' · '}frais appliqués : {Number(rapport.montant_applique).toLocaleString('fr-FR')} MRU
              </p>

              {/* Une ligne écartée doit dire pourquoi. Un import partiel
                  silencieux est pire qu'un import refusé : on croit la classe
                  complète et l'absence ne se voit qu'en délibération. */}
              {rapport.erreurs.length > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
                  <p className="text-xs font-semibold text-amber-800 mb-1 flex items-center gap-1.5">
                    <AlertCircle size={13} /> {rapport.erreurs.length} ligne(s) écartée(s)
                  </p>
                  <ul className="text-xs text-amber-800 space-y-0.5">
                    {rapport.erreurs.map(e => (
                      <li key={e.ligne}>
                        Ligne {e.ligne}{e.etudiant ? ` — ${e.etudiant}` : ''} : {e.motif}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {voie !== 'mers' && candidat && (
        <p className="text-xs text-iss-gray">
          Dossier repris du référentiel BAC — bachelier n° {candidat.num_bac}.
        </p>
      )}

      {voie !== 'bac' && voie !== 'mers' && (
      <Stepper steps={ETAPES} currentStep={etape} />
      )}

      {voie === 'formulaire' && (
      <div className={`${CARTE} p-5 space-y-4`}>
        {etape === 0 && (
          <>
            <h2 className="font-semibold text-iss-dark">Identité de l&apos;étudiant</h2>

            {/* Nom complet et lieu de naissance sont bilingues, comme sur le
                formulaire du socle : les documents officiels — attestation,
                relevé, décision — impriment les deux versions. */}
            <BilingualInput
              labelFr="Nom complet" labelAr="الاسم الكامل"
              valueFr={identite.nom} valueAr={identite.nom_ar ?? ''}
              onChangeFr={v => majIdentite('nom', v)}
              onChangeAr={v => majIdentite('nom_ar', v)}
              required
            />
            <BilingualInput
              labelFr="Lieu de naissance" labelAr="مكان الولادة"
              valueFr={identite.lieu_naissance_fr ?? ''}
              valueAr={identite.lieu_naissance_ar ?? ''}
              onChangeFr={v => majIdentite('lieu_naissance_fr', v)}
              onChangeAr={v => majIdentite('lieu_naissance_ar', v)}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <Champ label="Matricule *">
                <input value={identite.matricule} className={INPUT}
                       onChange={e => majIdentite('matricule', e.target.value)} />
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Champ label="Classe *">
                <select value={classeId ?? ''} className={SELECT}
                        onChange={e => setClasseId(e.target.value ? Number(e.target.value) : null)}>
                  <option value="">— Choisir —</option>
                  {classes.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
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
            {/* On inscrit dans une CLASSE. Les sous-groupes de TP se
                constituent ensuite, quand la classe est remplie et qu'on sait
                combien d'étudiants répartir — les demander ici obligerait à
                deviner une répartition avant de connaître l'effectif. */}
            <p className="text-xs text-iss-gray">
              Aucune matière à choisir : l&apos;étudiant sera inscrit à toute la maquette
              de son niveau, sur les deux semestres de l&apos;année. Le sous-groupe de TP
              s&apos;affecte plus tard, depuis la liste des inscriptions.
            </p>
          </>
        )}

        {etape === 2 && (
          <>
            <h2 className="font-semibold text-iss-dark">Confirmation</h2>
            <dl className="text-sm divide-y divide-gray-100">
              <Ligne cle="Étudiant" valeur={identite.nom.trim() || "—"} />
              {identite.nom_ar?.trim() && (
                <Ligne cle="Nom (AR)" valeur={identite.nom_ar} />
              )}
              <Ligne cle="Matricule" valeur={identite.matricule} />
              <Ligne cle="Classe" valeur={classe?.nom ?? '—'} />
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
      )}
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
