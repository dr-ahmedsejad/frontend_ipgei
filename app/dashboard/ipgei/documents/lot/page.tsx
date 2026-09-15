'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Download, FileStack, Loader2 } from 'lucide-react';

import { downloadBlob } from '@/lib/downloadBlob';
import {
  BTN_PRIMAIRE, Badge, CARTE, DEGRADE, EnTetePage, Erreur, SELECT, Toast,
} from '../../_ui';
import { useAnneeIPGEI } from '../../_annee';
import {
  useClassesSelect, useDocumentLot, useNiveauxCursus, useSemestresAll, useSignataires,
} from '@/lib/api/ipgei-hooks';
import type { BilanLot } from '@/lib/api/ipgei';

/**
 * Génération des documents officiels par groupe.
 *
 * Les relevés d'une classe pour un semestre, les attestations d'une promotion :
 * on les délivre par fournée, pas un par un. Le serveur rend UN seul PDF, tous
 * les élèves à la suite — quarante fichiers séparés obligeraient à les ouvrir
 * puis à les imprimer un par un.
 *
 * Chaque élève garde pourtant son document au registre : numéro de série,
 * empreinte et QR de vérification. La fusion ne concerne que le papier.
 */

const TYPES = [
  { cle: 'ipgei_releve_semestre',       label: 'Relevé de semestre', semestre: true },
  { cle: 'ipgei_releve_annuel',         label: 'Relevé annuel',      semestre: false },
  { cle: 'ipgei_attestation_inscription', label: "Attestation d'inscription", semestre: false },
  // L'autorisation de concourir ne vise pas toute la classe mais les seuls
  // étudiants que le jury a autorisés : le serveur les trie, et le bilan
  // annonce leur nombre — pas l'effectif de la classe.
  { cle: 'ipgei_attestation_cnim',      label: 'Attestation CNIM',   semestre: false },
] as const;

export default function DocumentsEnLotPage() {
  const { annee, setAnnee, options } = useAnneeIPGEI();

  const [type,      setType]      = useState<string>('ipgei_releve_semestre');
  const [classeId,  setClasseId]  = useState<number | null>(null);
  const [semestreId, setSemestreId] = useState<number | null>(null);
  // `null` = le signataire par défaut de l'institution. On ne présélectionne
  // personne : le choix n'a lieu d'être que si le titulaire est absent.
  const [signataireId, setSignataireId] = useState<number | null>(null);
  const [bilan,     setBilan]     = useState<BilanLot | null>(null);
  const [toast,     setToast]     = useState<string | null>(null);
  const [erreur,    setErreur]    = useState<string | null>(null);

  const { data: classes = [] } = useClassesSelect({
    annee_universitaire: annee, actif: true,
  });
  const { data: niveaux = [] } = useNiveauxCursus(true);
  const { data: semestres = [] } = useSemestresAll({ annee_universitaire: annee });
  const { data: signataires = [] } = useSignataires(true);
  const defaut = signataires.find(s => s.par_defaut) ?? null;
  const editer = useDocumentLot();

  const classe = classes.find(c => c.id === classeId) ?? null;

  // Les niveaux dont le jury peut autoriser à concourir. Lu dans le
  // référentiel et non écrit en dur : « MP » n'est pas la règle, la règle est
  // « le niveau qui prononce cette décision-là ». Un niveau ajouté au cursus
  // suit sans qu'on retouche cet écran. À défaut de liste explicite, le rang
  // tranche — le CNIM est une décision de deuxième année.
  const niveauxCnim = useMemo(
    () => new Set(niveaux
      .filter(n => (n.decisions_possibles?.length
        ? n.decisions_possibles.includes('autorise_cnim')
        : n.rang >= 2))
      .map(n => n.code)),
    [niveaux],
  );

  const reelles = useMemo(
    () => classes.filter(c => !c.est_conteneur
      && (type !== 'ipgei_attestation_cnim' || niveauxCnim.has(c.niveau))),
    [classes, type, niveauxCnim],
  );
  // Un semestre appartient à une année d'étude : seuls ceux du niveau de la
  // classe ont un sens ici.
  const semestresOuverts = useMemo(
    () => (classe ? semestres.filter(s => s.niveaux.includes(classe.niveau)) : []),
    [semestres, classe],
  );

  const definition = TYPES.find(t => t.cle === type);
  const semestreRequis = definition?.semestre ?? false;
  const pret = !!classeId && (!semestreRequis || !!semestreId);

  const telecharger = () => {
    if (!pret || !classeId) return;
    setErreur(null);
    setBilan(null);
    editer.mutate(
      {
        type_document: type, classe: classeId,
        semestre: semestreRequis ? semestreId ?? undefined : undefined,
        signataire: signataireId ?? undefined,
      },
      {
        onSuccess: (r) => {
          const semestre = semestres.find(s => s.id === semestreId);
          const nom = [
            definition?.cle.replace('ipgei_', ''),
            classe?.nom.replace(/\s+/g, '_'),
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
        icone={<FileStack size={14} className="text-white" />}
        titre="Génération par groupe"
        sousTitre="Toute une classe en un seul PDF, à imprimer d'un geste."
        actions={
          <select value={annee} onChange={e => { setAnnee(e.target.value); setClasseId(null); }}
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
                       onChange={() => {
                         setType(t.cle); setBilan(null);
                         // La classe choisie peut ne plus être proposable sous le
                         // nouveau type — une première année pour le CNIM. La
                         // laisser en place enverrait une classe absente de la
                         // liste, et l'écran refuserait sans qu'on voie pourquoi.
                         if (t.cle === 'ipgei_attestation_cnim' && classe
                             && !niveauxCnim.has(classe.niveau)) {
                           setClasseId(null); setSemestreId(null);
                         }
                       }}
                       className="accent-[#006633]" />
                <span className="text-sm text-iss-dark">{t.label}</span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-iss-dark mb-1.5">
            Classe <span className="text-red-600">*</span>
          </label>
          <select value={classeId ?? ''} className={SELECT}
                  onChange={e => { setClasseId(e.target.value ? Number(e.target.value) : null);
                                   setSemestreId(null); setBilan(null); }}>
            <option value="">— Choisir —</option>
            {reelles.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
          </select>
          {type === 'ipgei_attestation_cnim' && (
            <p className="text-xs text-iss-gray mt-1.5">
              {reelles.length
                ? "Seules les classes de deuxième année : c'est là que le jury "
                  + 'autorise à concourir.'
                : `Aucune classe de deuxième année en ${annee}. L'autorisation `
                  + 'de concourir se prononce en fin de deuxième année.'}
            </p>
          )}
        </div>

        {semestreRequis && (
          <div>
            <label className="block text-xs font-semibold text-iss-dark mb-1.5">
              Semestre <span className="text-red-600">*</span>
            </label>
            <select value={semestreId ?? ''} className={SELECT} disabled={!classeId}
                    onChange={e => setSemestreId(e.target.value ? Number(e.target.value) : null)}>
              <option value="">— Choisir —</option>
              {semestresOuverts.map(s => (
                <option key={s.id} value={s.id}>{s.code} — {s.libelle_annee}</option>
              ))}
            </select>
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
              {/* Un seul signataire pour toute la fournée : quarante pièces
                  sorties d'un même tirage se signent de la même main. */}
              <p className="text-xs text-iss-gray mt-1.5">
                {type === 'ipgei_attestation_cnim'
                  ? "L'autorisation de concourir est signée par le directeur : "
                    + "ne désignez quelqu'un que s'il signe à sa place."
                  : `Il signera les ${classe ? classe.nom : 'documents'} de cette `
                    + 'fournée — un seul nom pour toutes les pièces.'}
              </p>
            </>
          )}
        </div>

        {erreur && <Erreur erreur={new Error(erreur)} />}

        <button onClick={telecharger} disabled={!pret || editer.isPending}
                className={`${BTN_PRIMAIRE} w-full justify-center`} style={{ background: DEGRADE }}>
          {editer.isPending
            ? <><Loader2 size={14} className="animate-spin" /> Génération en cours…</>
            : <><Download size={14} /> Générer pour {classe?.nom ?? 'la classe'}</>}
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
          {/* Un dossier refusé n'interrompt pas le lot — mais il doit se lire,
              sinon on imprime trente-neuf relevés en croyant en avoir quarante. */}
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
