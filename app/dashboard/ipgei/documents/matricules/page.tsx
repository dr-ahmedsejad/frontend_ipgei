'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Download, Hash, Loader2 } from 'lucide-react';

import ChampMatricules, { type Pastille } from './_champ-matricules';
import { downloadBlob } from '@/lib/downloadBlob';
import {
  BTN_PRIMAIRE, Badge, CARTE, DEGRADE, EnTetePage, Erreur, SELECT, Toast,
} from '../../_ui';
import { useAnneeIPGEI } from '../../_annee';
import {
  useDocumentLot, useSemestresAll, useSignataires,
} from '@/lib/api/ipgei-hooks';
import type { BilanLot } from '@/lib/api/ipgei';

/**
 * Génération de documents pour une LISTE de matricules.
 *
 * L'édition par groupe part d'une classe entière. Elle ne couvre pas le cas
 * courant : quelques étudiants pris dans plusieurs classes, ceux d'une
 * commission, ceux qui ont réclamé leur pièce au guichet. Les sortir un par
 * un depuis la fiche de chacun coûte autant de navigations que d'étudiants.
 *
 * Un seul champ, donc, où l'on colle les matricules tels qu'on les a — d'un
 * tableur, d'un courriel, à la main. Le serveur découpe, résout, et NOMME
 * ceux qui n'aboutissent pas : un lot silencieusement amputé est pire qu'un
 * lot refusé, parce qu'on ne s'aperçoit de rien.
 *
 * Le reste est celui de l'édition par groupe — même route, même fusion en un
 * seul PDF, même bilan dans les en-têtes. Seule la façon de désigner les
 * étudiants change.
 */

const TYPES = [
  { cle: 'ipgei_releve_semestre',         label: 'Relevé de semestre',        semestre: true },
  { cle: 'ipgei_releve_annuel',           label: 'Relevé annuel',             semestre: false },
  { cle: 'ipgei_attestation_inscription', label: "Attestation d'inscription", semestre: false },
  { cle: 'ipgei_attestation_cnim',        label: 'Attestation CNIM',          semestre: false },
] as const;

export default function DocumentsParMatriculePage() {
  const { annee, setAnnee, options } = useAnneeIPGEI();

  const [type,        setType]        = useState<string>('ipgei_releve_semestre');
  const [pastilles,   setPastilles]   = useState<Pastille[]>([]);
  const [semestreId,  setSemestreId]  = useState<number | null>(null);
  const [signataireId, setSignataireId] = useState<number | null>(null);
  const [bilan,       setBilan]       = useState<BilanLot | null>(null);
  const [toast,       setToast]       = useState<string | null>(null);
  const [erreur,      setErreur]      = useState<string | null>(null);

  const { data: semestres = [] }   = useSemestresAll({ annee_universitaire: annee });
  const { data: signataires = [] } = useSignataires(true);
  const defaut = signataires.find(s => s.par_defaut) ?? null;
  const editer = useDocumentLot();

  // Les pastilles SONT la liste : plus rien à recompter ni à dédoublonner —
  // le champ s'en charge à la saisie, et l'on voit ce qu'on enverra.
  const definition = TYPES.find(t => t.cle === type);
  const semestreRequis = definition?.semestre ?? false;
  const pret = pastilles.length > 0 && (!semestreRequis || !!semestreId);

  const telecharger = () => {
    if (!pret) return;
    setErreur(null);
    setBilan(null);
    editer.mutate(
      {
        type_document: type,
        matricules: pastilles.map(p => p.matricule).join(','),
        annee_universitaire: annee,
        semestre: semestreRequis ? semestreId ?? undefined : undefined,
        signataire: signataireId ?? undefined,
      },
      {
        onSuccess: (r) => {
          const semestre = semestres.find(s => s.id === semestreId);
          const nom = [
            definition?.cle.replace('ipgei_', ''),
            `${r.edites}_etudiants`,
            semestreRequis ? semestre?.code : '',
          ].filter(Boolean).join('_');
          downloadBlob(r.blob, `${nom}.pdf`);
          setBilan(r);
          setToast(`${r.edites} document(s) sur ${r.total}`);
          setTimeout(() => setToast(null), 3200);
        },
        onError: (e) => setErreur(e instanceof Error ? e.message : 'Erreur'),
      },
    );
  };

  return (
    <div className="space-y-5 max-w-2xl">
      <Toast message={toast} />

      <Link href="/dashboard/ipgei/documents"
            className="inline-flex items-center gap-1.5 text-sm text-iss-gray hover:text-[#006633] transition-colors">
        <ArrowLeft size={14} /> Documents officiels
      </Link>

      <EnTetePage
        icone={<Hash size={14} className="text-white" />}
        titre="Génération par matricules"
        sousTitre="Collez les matricules, recevez un seul PDF."
        actions={
          <select value={annee} onChange={e => setAnnee(e.target.value)}
                  className={SELECT} style={{ width: 140 }}>
            {options.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        }
      />

      <div className={`${CARTE} p-6 space-y-4`}>
        <div>
          <label className="block text-xs font-semibold text-iss-dark mb-2">
            Document <span className="text-red-600">*</span>
          </label>
          <div className="space-y-1.5">
            {TYPES.map(t => (
              <label key={t.cle} className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="type" value={t.cle} checked={type === t.cle}
                       onChange={() => { setType(t.cle); setBilan(null); }}
                       className="w-4 h-4 accent-[#006633]" />
                <span className="text-sm text-iss-dark">{t.label}</span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-iss-dark mb-1.5">
            Matricules <span className="text-red-600">*</span>
          </label>
          {/* Une pastille par étudiant : ça se compte d'un regard et se retire
              d'un clic. Coller une liste entière reste possible — c'est le
              geste le plus fréquent, il vient d'un tableur. */}
          <ChampMatricules valeur={pastilles} annee={annee}
                           onChange={v => { setPastilles(v); setBilan(null); }} />
          <div className="flex items-baseline justify-between gap-3 mt-1.5">
            <p className="text-xs text-iss-gray">
              Tapez un matricule ou un nom, ou collez une liste entière.
            </p>
            {pastilles.length > 0 && (
              <div className="flex items-baseline gap-3 flex-shrink-0">
                <span className="text-xs text-iss-dark">
                  <b>{pastilles.length}</b> étudiant{pastilles.length > 1 ? 's' : ''}
                </span>
                <button type="button" onClick={() => { setPastilles([]); setBilan(null); }}
                        className="text-xs text-iss-gray hover:text-red-600 transition-colors">
                  Tout retirer
                </button>
              </div>
            )}
          </div>
        </div>

        {semestreRequis && (
          <div>
            <label className="block text-xs font-semibold text-iss-dark mb-1.5">
              Semestre <span className="text-red-600">*</span>
            </label>
            <select value={semestreId ?? ''} className={SELECT}
                    onChange={e => setSemestreId(e.target.value ? Number(e.target.value) : null)}>
              <option value="">— Choisir —</option>
              {semestres.map(s => (
                <option key={s.id} value={s.id}>{s.code} — {s.libelle_annee}</option>
              ))}
            </select>
            {/* La liste peut traverser plusieurs niveaux : on ne filtre donc
                pas les semestres par classe, comme le fait l'édition par
                groupe. Un étudiant qui n'a pas ce semestre sera reporté au
                bilan plutôt qu'écarté d'avance. */}
            <p className="text-xs text-iss-gray mt-1.5">
              Tous les semestres de {annee} : la liste peut mêler des niveaux.
            </p>
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold text-iss-dark mb-1.5">
            Signataire
          </label>
          {signataires.length === 0 ? (
            <p className="text-xs text-iss-gray bg-gray-50 border border-gray-100 rounded-xl px-4 py-2.5">
              Aucun signataire enregistré : les documents sortiront au titre
              «&nbsp;Chef service de la Scolarité&nbsp;», sans nom. Pour
              désigner quelqu&apos;un, passez par{' '}
              <Link href="/dashboard/parametres/cursus/signataires"
                    className="text-[#006633] font-medium hover:underline">
                Paramétrage → Signataires
              </Link>.
            </p>
          ) : (
            <>
              <select value={signataireId ?? ''} className={SELECT}
                      onChange={e => setSignataireId(e.target.value ? Number(e.target.value) : null)}>
                <option value="">
                  {defaut ? `Par défaut — ${defaut.nom_fr} (${defaut.titre_fr})`
                          : 'Par défaut'}
                </option>
                {signataires.map(s => (
                  <option key={s.id} value={s.id}>{s.nom_fr} — {s.titre_fr}</option>
                ))}
              </select>
              <p className="text-xs text-iss-gray mt-1.5">
                {type === 'ipgei_attestation_cnim'
                  ? "L'autorisation de concourir est signée par le directeur : "
                    + "ne désignez quelqu'un que s'il signe à sa place."
                  : 'Un seul nom pour toutes les pièces de cette fournée.'}
              </p>
            </>
          )}
        </div>

        {erreur && <Erreur erreur={new Error(erreur)} />}

        <button onClick={telecharger} disabled={!pret || editer.isPending}
                className={`${BTN_PRIMAIRE} w-full justify-center`} style={{ background: DEGRADE }}>
          {editer.isPending
            ? <><Loader2 size={14} className="animate-spin" /> Génération en cours…</>
            : <><Download size={14} /> Générer {pastilles.length || ''} document
                {pastilles.length > 1 ? 's' : ''}</>}
        </button>
      </div>

      {bilan && (
        <div className={`${CARTE} p-4 space-y-2`}
             style={{ borderLeft: `3px solid ${bilan.erreurs.length ? '#d97706' : '#006633'}` }}>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge ton={bilan.erreurs.length ? 'ambre' : 'vert'}>
              {bilan.edites} / {bilan.total}
            </Badge>
            <span className="text-sm text-iss-dark">
              document{bilan.edites > 1 ? 's' : ''} généré{bilan.edites > 1 ? 's' : ''}
            </span>
          </div>
          {/* Matricule inconnu, dossier refusé : le lot passe quand même, mais
              cela doit se LIRE — sinon on imprime dix-huit relevés en croyant
              en avoir vingt. */}
          {bilan.erreurs.map(e => (
            <p key={e.etudiant} className="text-xs text-amber-700">
              <b>{e.etudiant}</b> {e.nom} — {e.motif}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
