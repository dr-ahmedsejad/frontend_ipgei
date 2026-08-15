'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, Award, CheckCircle2, Download, Loader2, Upload, XCircle,
} from 'lucide-react';

import { downloadBlob } from '@/lib/downloadBlob';
import { validateUpload } from '@/lib/file-validation';
import {
  BTN_PRIMAIRE, BTN_SECONDAIRE, Badge, CARTE, Chargement, DEGRADE, EnTetePage,
  Erreur, SELECT, Toast, Vide,
} from '../../_ui';
import { useAnneeIPGEI } from '../../_annee';
import {
  useConcoursCNIM, useConcoursMutations, useNiveauxCursus,
} from '@/lib/api/ipgei-hooks';
import type { BilanConcours } from '@/lib/api/ipgei';

/**
 * Résultat du concours CNIM, et situation de fin de cursus.
 *
 * Ce n'est pas un jury : le concours est EXTERNE, son résultat se constate. La
 * conséquence, elle, est mécanique — admis, l'étudiant sort ; non admis, il
 * redouble s'il lui reste un droit, il est réorienté sinon.
 *
 * D'où l'aperçu avant d'appliquer : un redoublement compté ne se reprend pas
 * d'un clic.
 */
export default function ConcoursCnimPage() {
  const { annee, setAnnee, options } = useAnneeIPGEI();
  const [niveau, setNiveau] = useState('');
  const [definitive, setDefinitive] = useState(false);
  const [bilan, setBilan] = useState<BilanConcours | null>(null);
  const [toast, setToast]   = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const fichierRef = useRef<HTMLInputElement>(null);
  /** Le jury d'où l'on vient : on y retourne, on ne le recherche pas. */
  const [retour, setRetour] = useState<number | null>(null);

  // Ouverture depuis le fil du parcours d'un jury : l'année et le niveau
  // arrivent déjà posés. La lecture se fait au montage plutôt qu'avec
  // `useSearchParams`, qui imposerait une frontière Suspense à toute la page
  // pour trois paramètres facultatifs — c'est l'usage de la maison.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const anneeDemandee = params.get('annee');
    const niveauDemande = params.get('niveau');
    const jurySource    = Number(params.get('retour'));
    if (anneeDemandee) setAnnee(anneeDemandee);
    if (niveauDemande) setNiveau(niveauDemande);
    if (Number.isFinite(jurySource) && jurySource > 0) setRetour(jurySource);
    // Au montage seulement : ensuite, les sélections appartiennent à l'écran.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Le concours clôt la deuxième année : proposer MPSI mènerait à une liste
  // vide sans qu'on comprenne pourquoi.
  const { data: tousNiveaux = [] } = useNiveauxCursus(true);
  const niveaux = useMemo(
    () => tousNiveaux.filter(n => n.rang === 2)
      .map(n => ({ value: n.code, label: n.libelle || n.code })),
    [tousNiveaux],
  );

  const { data: grille, isLoading } = useConcoursCNIM(annee, niveau || undefined);
  const { saisir, importer, appliquer, modele } =
    useConcoursMutations(annee, niveau || undefined);

  const notifier = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3600);
  };
  const echec = (e: unknown) =>
    setErreur(e instanceof Error ? e.message : 'Erreur');

  const marquer = (inscription: number, resultat: string) => {
    setErreur(null); setBilan(null);
    saisir.mutate([{ inscription, resultat }], { onError: echec });
  };

  const televerser = (fichier: File | undefined) => {
    if (!fichier) return;
    const faute = validateUpload(fichier, {
      maxSizeMb: 5, accept: '.xlsx,.xlsm,.csv,.txt',
    });
    if (faute) { setErreur(faute); return; }
    setErreur(null); setBilan(null);
    importer.mutate({ fichier, definitive }, {
      onSuccess: (r) => {
        notifier(`${r.admis} admis${r.non_admis ? `, ${r.non_admis} non admis` : ''}`
          + ` — ${r.lus} matricule(s) lus`
          + (r.inconnus.length ? ` · inconnus : ${r.inconnus.join(', ')}` : ''));
        if (fichierRef.current) fichierRef.current.value = '';
      },
      onError: echec,
    });
  };

  // Le modèle part rempli des candidats : on écrit ADMIS en face des noms, et
  // le même écran le reprend. Aucun matricule à retaper, donc aucun à fauter.
  const editerModele = () => {
    setErreur(null);
    modele.mutate(undefined, {
      onSuccess: (blob) => downloadBlob(
        blob, `CNIM_${niveau || '2e-annee'}_${annee}.xlsx`),
      onError: echec,
    });
  };

  const voir = () => {
    setErreur(null);
    appliquer.mutate(true, { onSuccess: setBilan, onError: echec });
  };

  const poser = () => {
    setErreur(null);
    appliquer.mutate(false, {
      onSuccess: (r) => {
        setBilan(null);
        notifier(`${r.appliques} situation(s) posée(s)`);
      },
      onError: echec,
    });
  };

  const lignes = grille?.lignes ?? [];

  return (
    <div className="space-y-5 max-w-5xl">
      <Link href={retour ? `/dashboard/ipgei/deliberations/${retour}`
                         : '/dashboard/ipgei/deliberations'}
            className="inline-flex items-center gap-1.5 text-sm text-iss-gray hover:text-[#006633] transition-colors">
        <ArrowLeft size={14} /> {retour ? 'Retour au jury annuel' : 'Délibérations'}
      </Link>

      <EnTetePage
        icone={<Award size={14} className="text-white" />}
        titre="Résultat du concours (CNIM)"
        sousTitre="Admis, l'étudiant sort ; non admis, il redouble s'il lui reste un droit, il est réorienté sinon."
        actions={
          <select value={annee} className={SELECT} style={{ width: 140 }}
                  onChange={e => { setAnnee(e.target.value); setBilan(null); }}>
            {options.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        }
      />

      <div className={`${CARTE} p-6 space-y-4`}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-semibold text-iss-dark mb-1.5">
              Niveau
            </label>
            <select value={niveau} className={SELECT}
                    onChange={e => { setNiveau(e.target.value); setBilan(null); }}>
              <option value="">Tous les niveaux de 2e année</option>
              {niveaux.map(n => (
                <option key={n.value} value={n.value}>{n.label}</option>
              ))}
            </select>
          </div>
          <div>
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <label className="block text-xs font-semibold text-iss-dark">
                Importer la liste des admis
              </label>
              <button type="button" onClick={editerModele}
                      disabled={modele.isPending || !lignes.length}
                      className="inline-flex items-center gap-1 text-xs font-medium
                                 text-[#006633] hover:underline disabled:opacity-40
                                 disabled:no-underline disabled:cursor-not-allowed">
                {modele.isPending
                  ? <Loader2 size={12} className="animate-spin" />
                  : <Download size={12} />}
                Modèle à remplir
              </button>
            </div>
            <input ref={fichierRef} type="file" accept=".xlsx,.xlsm,.csv,.txt"
                   disabled={importer.isPending}
                   onChange={e => televerser(e.target.files?.[0])}
                   className="block w-full text-xs text-iss-gray file:mr-3 file:py-2
                              file:px-3 file:rounded-lg file:border file:border-gray-200
                              file:text-xs file:font-semibold file:bg-white" />
            <label className="flex items-center gap-2 mt-2 text-xs text-iss-gray">
              <input type="checkbox" checked={definitive}
                     onChange={e => setDefinitive(e.target.checked)} />
              {/* Une liste d'admis ne dit rien de ceux qui n'y sont pas : le
                  basculement en « non admis » se demande, il ne se déduit pas. */}
              Liste définitive — les absents deviennent <b>non admis</b>
            </label>
          </div>
        </div>

        {erreur && <Erreur erreur={new Error(erreur)} />}

        <div className="flex items-center gap-2 flex-wrap">
          {/* Un bouton grisé sans motif se lit comme une panne. On dit donc
              POURQUOI il l'est : rien à poser, ou aucun résultat encore su. */}
          <button onClick={voir}
                  disabled={!grille?.a_appliquer || appliquer.isPending}
                  title={grille?.a_appliquer ? undefined
                         : grille?.en_attente
                           ? 'Aucun résultat de concours n’est encore saisi : '
                             + 'rien ne peut être appliqué.'
                           : 'Toutes les situations connues ont déjà été posées.'}
                  className={BTN_SECONDAIRE}>
            {appliquer.isPending && appliquer.variables
              ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            Voir ce qui changerait
          </button>
          {grille && (
            <span className="text-xs text-iss-gray">
              {grille.en_attente} en attente · {grille.a_appliquer} situation(s) à poser
              · droit de redoublement : {grille.droit_redoublement}
              {!grille.a_appliquer && (grille.en_attente
                ? ' — saisissez ou importez les résultats pour pouvoir appliquer.'
                : ' — tout est appliqué.')}
            </span>
          )}
        </div>

        {/* L'aperçu AVANT d'agir : un redoublement compté ne se reprend pas. */}
        {bilan && (
          <div className="rounded-xl border border-gray-100 p-4 space-y-2"
               style={{ background: 'rgba(0,102,51,0.03)' }}>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-bold text-iss-dark">
                {bilan.a_appliquer} situation(s) seront posées
              </span>
              {Object.entries(bilan.repartition).map(([libelle, nombre]) => (
                <Badge key={libelle}
                       ton={libelle.startsWith('Sortant') ? 'vert'
                            : libelle.startsWith('Redoublant') ? 'ambre' : 'rouge'}>
                  {libelle} : {nombre}
                </Badge>
              ))}
            </div>
            {bilan.en_attente > 0 && (
              <p className="text-xs text-amber-700">
                {bilan.en_attente} étudiant(s) sans résultat connu — ils ne
                bougeront pas.
              </p>
            )}
            <button onClick={poser} disabled={appliquer.isPending}
                    className={BTN_PRIMAIRE} style={{ background: DEGRADE }}>
              {appliquer.isPending
                ? <Loader2 size={14} className="animate-spin" />
                : <CheckCircle2 size={14} />}
              Appliquer les situations
            </button>
          </div>
        )}
      </div>

      {isLoading ? <Chargement /> : !lignes.length ? (
        <Vide texte={`Aucun étudiant autorisé à concourir en ${annee}. `
                     + `L'autorisation vient du jury annuel ou du jury de rattrapage.`} />
      ) : (
        <div className={CARTE}>
          <div className="px-5 py-3 border-b border-gray-100">
            <h2 className="text-sm font-bold text-iss-dark">
              {lignes.length} candidat{lignes.length > 1 ? 's' : ''} au concours
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold text-iss-gray uppercase tracking-wide border-b border-gray-100">
                  <th className="px-4 py-3">Étudiant</th>
                  <th className="px-4 py-3">Classe</th>
                  <th className="px-4 py-3 text-center">Résultat du concours</th>
                  <th className="px-4 py-3">Situation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {lignes.map(ligne => (
                  <tr key={ligne.inscription} className="hover:bg-gray-50/60">
                    <td className="px-4 py-2.5">
                      <div className="font-semibold text-iss-dark">{ligne.etudiant_nom}</div>
                      <div className="text-xs text-iss-gray">
                        {ligne.etudiant_matricule}
                        {ligne.nb_redoublements > 0
                          && ` · ${ligne.nb_redoublements} redoublement(s)`}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-iss-gray">{ligne.classe_nom}</td>
                    <td className="px-4 py-2.5">
                      {/* Trois états, dont le retour en attente : on corrige une
                          saisie sans avoir à défaire une situation. */}
                      <div className="flex items-center justify-center gap-1.5">
                        {([
                          ['admis',     'Admis',     'border-[#006633] bg-[#006633] text-white'],
                          ['non_admis', 'Non admis', 'border-red-600 bg-red-600 text-white'],
                          ['',          'En attente', 'border-slate-400 bg-slate-400 text-white'],
                        ] as const).map(([valeur, libelle, actif]) => (
                          <button key={libelle}
                                  onClick={() => marquer(ligne.inscription, valeur)}
                                  disabled={ligne.applique || saisir.isPending}
                                  className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors
                                    disabled:opacity-40 disabled:cursor-not-allowed ${
                                    ligne.resultat === valeur ? actif
                                      : 'border-slate-200 text-iss-gray hover:bg-slate-50'}`}>
                            {libelle}
                          </button>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      {ligne.applique ? (
                        <span className="inline-flex items-center gap-1.5">
                          <Badge ton={ligne.statut === 'sortant' ? 'vert'
                                      : ligne.statut === 'redoublant' ? 'ambre' : 'rouge'}>
                            {ligne.statut_display}
                          </Badge>
                          <span className="text-[11px] text-iss-gray">posée</span>
                        </span>
                      ) : ligne.situation_projetee ? (
                        <span className="inline-flex items-center gap-1.5 text-xs text-iss-gray">
                          <XCircle size={12} className="opacity-0" />
                          deviendra <b className="text-iss-dark">{ligne.situation_libelle}</b>
                        </span>
                      ) : (
                        <span className="text-xs text-iss-gray">— en attente du résultat</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="px-5 py-3 text-xs text-iss-gray border-t border-gray-100">
            Une situation posée ne se resaisit plus depuis cet écran : le statut
            de l&apos;inscription fait foi. Réappliquer ne compte jamais un second
            redoublement.
          </p>
        </div>
      )}

      <Toast message={toast} />
    </div>
  );
}
