'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowLeftRight, Loader2, Shuffle, Users } from 'lucide-react';

import {
  BTN_PRIMAIRE, BTN_SECONDAIRE, Badge, CARTE, Chargement, DEGRADE, EnTetePage,
  Erreur, SELECT, Toast, Vide,
} from '../../_ui';
import { useAnneeIPGEI } from '../../_annee';
import {
  useClassesSelect, useInscriptions, useRepartition,
} from '@/lib/api/ipgei-hooks';

/**
 * Répartition d'une classe vers une autre.
 *
 * À la rentrée, on ne traite pas des demandes individuelles : on constitue des
 * groupes. Le circuit de la permutation — formulaire signé, accord des deux
 * élèves — vaut pour un changement demandé en cours d'année ; il n'a pas de
 * sens pour partager dix-sept arrivants entre deux classes.
 *
 * Le mouvement emprunte pourtant le même chemin : l'historique est journalisé
 * élève par élève, le département suit — sans quoi il disparaîtrait des listes
 * d'appel —, et l'inscription garde son identité, donc ses notes et ses
 * absences.
 */
export default function RepartitionPage() {
  const { annee, setAnnee, options } = useAnneeIPGEI();

  const [sourceId, setSourceId] = useState<number | null>(null);
  const [cibleId,  setCibleId]  = useState<number | null>(null);
  const [choisis,  setChoisis]  = useState<Set<number>>(new Set());
  const [toast,    setToast]    = useState<string | null>(null);
  const [erreur,   setErreur]   = useState<string | null>(null);

  const { data: classes = [] } = useClassesSelect({
    annee_universitaire: annee, actif: true,
  });
  const reparties = useRepartition();

  const source = classes.find(c => c.id === sourceId) ?? null;
  const reelles = useMemo(() => classes.filter(c => !c.est_conteneur), [classes]);
  // Une répartition ne change pas de niveau : MPSI A ne se déverse pas dans MP B.
  const cibles = useMemo(
    () => reelles.filter(c => c.id !== sourceId && c.niveau === source?.niveau),
    [reelles, sourceId, source],
  );

  const { data, isLoading } = useInscriptions({
    page: 1, page_size: 200, actif: true,
    classe: sourceId ?? undefined,
    annee_universitaire: annee || '__aucune__',
  } as never);
  const inscrits = useMemo(() => data?.results ?? [], [data]);

  // La sélection ne survit pas à un changement de classe : garder des cases
  // cochées d'une autre classe déplacerait des élèves qu'on ne regarde plus.
  useEffect(() => { setChoisis(new Set()); }, [sourceId, cibleId, annee]);

  const basculer = (id: number) => setChoisis(actuels => {
    const suite = new Set(actuels);
    if (suite.has(id)) suite.delete(id); else suite.add(id);
    return suite;
  });

  /**
   * Proposition d'équilibrage : une ligne sur deux, dans l'ordre affiché.
   *
   * Alternée plutôt que « la seconde moitié » : la liste est ordonnée, et
   * couper en deux mettrait tous les premiers d'un côté. Ce n'est qu'une
   * proposition — on la corrige avant de valider.
   */
  const proposer = () => {
    const cible = Math.floor(inscrits.length / 2);
    setChoisis(new Set(inscrits.filter((_, i) => i % 2 === 1)
                               .slice(0, cible)
                               .map(i => i.id)));
  };

  const deplacer = () => {
    if (!cibleId || choisis.size === 0) return;
    setErreur(null);
    reparties.mutate(
      {
        mouvements: [...choisis].map(inscription => ({ inscription, classe: cibleId })),
        motif: `Répartition ${source?.nom ?? ''} → ${classes.find(c => c.id === cibleId)?.nom ?? ''}`,
      },
      {
        onSuccess: (r) => {
          setChoisis(new Set());
          setToast(`${r.deplacees} étudiant(s) déplacé(s)`);
          setTimeout(() => setToast(null), 3000);
        },
        onError: (e) => setErreur(e instanceof Error ? e.message : 'Erreur'),
      },
    );
  };

  return (
    <div className="space-y-5 max-w-4xl">
      <Toast message={toast} />

      <Link href="/dashboard/ipgei/inscriptions"
            className="inline-flex items-center gap-1.5 text-sm text-iss-gray hover:text-[#006633] transition-colors">
        <ArrowLeft size={14} /> Inscriptions
      </Link>

      <EnTetePage
        icone={<ArrowLeftRight size={14} className="text-white" />}
        titre="Répartition entre classes"
        sousTitre="Partager les arrivants entre deux classes du même niveau. Notes, absences et frais suivent l'étudiant."
        actions={
          <select value={annee} onChange={e => setAnnee(e.target.value)}
                  className={SELECT} style={{ width: 140 }}>
            {options.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        }
      />

      <div className={`${CARTE} p-5`}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-semibold text-iss-dark mb-1.5">
              Classe de départ <span className="text-red-600">*</span>
            </label>
            <select value={sourceId ?? ''} className={SELECT}
                    onChange={e => { setSourceId(e.target.value ? Number(e.target.value) : null);
                                     setCibleId(null); }}>
              <option value="">— Choisir —</option>
              {reelles.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-iss-dark mb-1.5">
              Classe d&apos;arrivée <span className="text-red-600">*</span>
            </label>
            <select value={cibleId ?? ''} className={SELECT} disabled={!sourceId}
                    onChange={e => setCibleId(e.target.value ? Number(e.target.value) : null)}>
              <option value="">— Choisir —</option>
              {cibles.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
            </select>
            {sourceId && cibles.length === 0 && (
              <p className="mt-1.5 text-xs text-amber-700">
                Aucune autre classe de {source?.niveau} en {annee}.
              </p>
            )}
          </div>
        </div>
        {erreur && <div className="mt-3"><Erreur erreur={new Error(erreur)} /></div>}
      </div>

      {!sourceId ? (
        <div className={CARTE}>
          <Vide texte="Choisissez la classe dont vous voulez déplacer des étudiants." />
        </div>
      ) : isLoading ? (
        <div className={CARTE}><Chargement /></div>
      ) : inscrits.length === 0 ? (
        <div className={CARTE}><Vide texte={`${source?.nom} n'a aucun inscrit actif.`} /></div>
      ) : (
        <div className={CARTE}>
          <div className="px-5 pt-5 pb-3 flex items-center gap-2 flex-wrap">
            <Users size={15} className="text-[#006633]" />
            <h2 className="text-sm font-bold text-iss-dark">
              {source?.nom} — {inscrits.length} inscrit{inscrits.length > 1 ? 's' : ''}
            </h2>
            <Badge ton={choisis.size ? 'bleu' : 'neutre'}>
              {choisis.size} sélectionné(s)
            </Badge>

            <button onClick={proposer} className={`${BTN_SECONDAIRE} ml-auto`}>
              <Shuffle size={13} /> Proposer un équilibrage
            </button>
            <button onClick={deplacer}
                    disabled={!cibleId || choisis.size === 0 || reparties.isPending}
                    className={BTN_PRIMAIRE} style={{ background: DEGRADE }}>
              {reparties.isPending
                ? <><Loader2 size={13} className="animate-spin" /> Déplacement…</>
                : <><ArrowLeftRight size={13} /> Déplacer {choisis.size || ''}</>}
            </button>
          </div>

          <p className="px-5 pb-3 text-xs text-iss-gray">
            Après déplacement, {source?.nom} garderait{' '}
            <b>{inscrits.length - choisis.size}</b> étudiant(s).
            {' '}Le mouvement est journalisé et réversible depuis cet écran.
          </p>

          <div className="border-t border-gray-100 divide-y divide-gray-100">
            {inscrits.map(i => {
              const coche = choisis.has(i.id);
              return (
                <label key={i.id}
                       className={`flex items-center gap-3 px-5 py-2.5 cursor-pointer ${coche ? 'bg-[#006633]/5' : ''}`}>
                  <input type="checkbox" checked={coche} className="accent-[#006633]"
                         onChange={() => basculer(i.id)} />
                  <span className="text-sm font-semibold text-iss-dark min-w-[220px]">
                    {i.etudiant_nom}
                  </span>
                  <span className="text-xs text-iss-gray">{i.etudiant_matricule}</span>
                  {i.sous_groupe_libelle && (
                    <span className="text-xs text-iss-gray">· {i.sous_groupe_libelle}</span>
                  )}
                </label>
              );
            })}
          </div>

          <p className="px-5 py-3 text-xs text-iss-gray border-t border-gray-100">
            Le sous-groupe de TP appartient à la classe de départ : il est vidé au
            passage, et se redonne dans la classe d&apos;arrivée.
          </p>
        </div>
      )}
    </div>
  );
}
