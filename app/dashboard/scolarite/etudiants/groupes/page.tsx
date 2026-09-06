'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Check, RotateCcw, Save, Shuffle, Users } from 'lucide-react';

import {
  BTN_PRIMAIRE, BTN_SECONDAIRE, CARTE, Chargement, DEGRADE, EnTetePage, Erreur,
  SELECT, Toast, VERT, Vide,
} from '../../../ipgei/_ui';
import { anneeParDefaut } from '../../../ipgei/_annee';
import {
  useClassesSelect, useInscriptionMutations, useInscriptionsAll, useSousGroupes,
} from '@/lib/api/ipgei-hooks';
import type { Inscription } from '@/types/ipgei';

/**
 * Affectation des étudiants aux groupes d'une classe.
 *
 * Le geste de la rentrée : la scolarité constitue ses demi-groupes de TD. Il
 * existait déjà, mais fiche par fiche — ouvrir une inscription, choisir le
 * groupe, enregistrer, recommencer trente fois. Et il faut le refaire après
 * chaque répartition entre classes, qui vide les groupes puisqu'un groupe
 * appartient à une classe.
 *
 * L'écran tient en une colonne par groupe, plus celle des non affectés. On
 * clique des étudiants — ils se marquent —, puis le groupe d'arrivée. Rien
 * n'est envoyé avant « Enregistrer » : on compose la répartition entière, on
 * la relit, on la valide d'un coup. Tout passe ou rien, côté serveur.
 */

const SANS_GROUPE = '__sans__';
const ROUGE = '#C82020';

/** Une colonne : un groupe de la classe, ou le bac des non affectés. */
interface Colonne {
  cle:      string;
  libelle:  string;
  id:       number | null;
  inscrits: Inscription[];
}

export default function AffectationGroupesPage() {
  const annee = anneeParDefaut();

  const [classeId, setClasseId] = useState<number | null>(null);
  /** Les changements en cours : inscription → groupe cible (null = aucun). */
  const [brouillon, setBrouillon] = useState<Record<number, number | null>>({});
  const [choisis, setChoisis]     = useState<Set<number>>(new Set());
  const [toast, setToast]         = useState<string | null>(null);
  const [erreur, setErreur]       = useState<string | null>(null);

  const notifier = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2800); };

  const { data: classes = [] } = useClassesSelect({ annee_universitaire: annee, actif: true });
  const { data: groupes = [] } = useSousGroupes(classeId);
  const { data: inscrits, isLoading, error } = useInscriptionsAll(
    classeId ? { classe: classeId, actif: true } : undefined,
  );
  const { affecterGroupes } = useInscriptionMutations();

  /** Le groupe d'un inscrit : celui du brouillon s'il a bougé, le sien sinon. */
  const groupeDe = (i: Inscription): number | null =>
    i.id in brouillon ? brouillon[i.id] : i.sous_groupe;

  const colonnes: Colonne[] = useMemo(() => {
    const liste = inscrits ?? [];
    const trier = (a: Inscription, b: Inscription) =>
      a.etudiant_matricule.localeCompare(b.etudiant_matricule, undefined, { numeric: true });
    return [
      ...groupes.map(g => ({
        cle: String(g.id), libelle: g.libelle, id: g.id,
        inscrits: liste.filter(i => groupeDe(i) === g.id).sort(trier),
      })),
      {
        cle: SANS_GROUPE, libelle: 'Sans groupe', id: null,
        inscrits: liste.filter(i => groupeDe(i) === null).sort(trier),
      },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inscrits, groupes, brouillon]);

  const modifications = Object.entries(brouillon).filter(([id, cible]) => {
    const inscrit = (inscrits ?? []).find(i => i.id === Number(id));
    return inscrit && inscrit.sous_groupe !== cible;
  });

  function basculer(id: number) {
    setChoisis(precedent => {
      const suivant = new Set(precedent);
      if (suivant.has(id)) suivant.delete(id); else suivant.add(id);
      return suivant;
    });
  }

  function deplacerVers(cible: number | null) {
    if (choisis.size === 0) return;
    setBrouillon(b => {
      const suivant = { ...b };
      for (const id of choisis) suivant[id] = cible;
      return suivant;
    });
    setChoisis(new Set());
  }

  /**
   * Répartit les NON AFFECTÉS entre les groupes, en alternant.
   *
   * On ne touche pas à ceux qui ont déjà un groupe : refaire toute la classe
   * défairait un travail déjà fait. C'est une aide au démarrage, pas un
   * arbitrage — tout reste modifiable avant d'enregistrer.
   */
  function repartirAutomatiquement() {
    if (groupes.length === 0) return;
    const aPlacer = colonnes.find(c => c.cle === SANS_GROUPE)?.inscrits ?? [];
    if (aPlacer.length === 0) { notifier('Tout le monde a déjà un groupe.'); return; }
    // On complète le groupe le moins rempli d'abord : la répartition reste
    // équilibrée même quand une partie de la classe est déjà placée.
    const effectifs = new Map(colonnes.filter(c => c.id !== null)
      .map(c => [c.id as number, c.inscrits.length]));
    setBrouillon(b => {
      const suivant = { ...b };
      for (const inscrit of aPlacer) {
        const cible = [...effectifs.entries()].sort((x, y) => x[1] - y[1])[0][0];
        suivant[inscrit.id] = cible;
        effectifs.set(cible, (effectifs.get(cible) ?? 0) + 1);
      }
      return suivant;
    });
    setChoisis(new Set());
    notifier(`${aPlacer.length} étudiant${aPlacer.length > 1 ? 's' : ''} réparti${aPlacer.length > 1 ? 's' : ''} — relisez avant d'enregistrer.`);
  }

  function enregistrer() {
    if (modifications.length === 0) return;
    setErreur(null);
    affecterGroupes.mutate(
      modifications.map(([id, cible]) => ({ inscription: Number(id), sous_groupe: cible })),
      {
        onSuccess: (bilan) => {
          setBrouillon({}); setChoisis(new Set());
          notifier(`${bilan.affectees} affectation${bilan.affectees > 1 ? 's' : ''} enregistrée${bilan.affectees > 1 ? 's' : ''}`);
        },
        onError: (e: unknown) => setErreur(e instanceof Error ? e.message : 'Erreur'),
      },
    );
  }

  const classeNom = classes.find(c => c.id === classeId)?.nom ?? '';

  return (
    <div className="space-y-5 max-w-6xl">
      <Link href="/dashboard/scolarite/etudiants"
            className="inline-flex items-center gap-1.5 text-sm text-iss-gray hover:text-[#006633] transition-colors">
        <ArrowLeft size={14} /> Liste des étudiants
      </Link>

      <EnTetePage
        icone={<Users size={14} className="text-white" />}
        titre="Affectation aux groupes"
        sousTitre="Cliquez des étudiants, puis le groupe d'arrivée. Rien n'est envoyé avant « Enregistrer »."
      />

      <Erreur erreur={error} />
      {erreur && <p className="text-sm bg-red-50 text-iss-secondary rounded-xl p-4">{erreur}</p>}

      {/* Le choix de la classe commande tout le reste. */}
      <div className={`${CARTE} p-4 flex flex-wrap items-end gap-4`}>
        <div>
          <label className="block text-xs font-semibold text-iss-dark mb-1.5">
            Classe <span className="text-red-600">*</span>
          </label>
          <select value={classeId ?? ''} className={SELECT} style={{ minWidth: 220 }}
                  onChange={e => {
                    setClasseId(e.target.value ? Number(e.target.value) : null);
                    setBrouillon({}); setChoisis(new Set()); setErreur(null);
                  }}>
            <option value="">— Choisir une classe —</option>
            {classes.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
          </select>
        </div>
        {classeId && groupes.length > 0 && (
          <button onClick={repartirAutomatiquement} className={BTN_SECONDAIRE}>
            <Shuffle size={14} /> Répartir les non affectés
          </button>
        )}
        {classeId && (
          <Link href="/dashboard/ipgei/classes"
                className="text-xs font-semibold text-iss-primary hover:underline ml-auto">
            Créer ou renommer un groupe
          </Link>
        )}
      </div>

      {!classeId ? (
        <div className={CARTE}>
          <Vide texte="Choisissez une classe pour composer ses groupes." />
        </div>
      ) : isLoading ? (
        <div className={CARTE}><Chargement texte="Chargement de la classe…" /></div>
      ) : groupes.length === 0 ? (
        <div className={CARTE}>
          <Vide texte={`${classeNom} n'a aucun groupe. Créez-les d'abord.`}
                action={
                  <Link href="/dashboard/ipgei/classes" className={BTN_PRIMAIRE}
                        style={{ background: DEGRADE }}>
                    Gérer les groupes
                  </Link>
                } />
        </div>
      ) : (
        <>
          {/* La barre d'action n'apparaît qu'une fois quelqu'un choisi : tant
              qu'on n'a rien sélectionné, elle n'aurait rien à faire. */}
          {choisis.size > 0 && (
            <div className={`${CARTE} px-4 py-3 flex flex-wrap items-center gap-3 sticky top-2 z-10`}
                 style={{ borderLeft: `3px solid ${VERT}` }}>
              <span className="text-sm font-semibold text-iss-dark">
                {choisis.size} étudiant{choisis.size > 1 ? 's' : ''} sélectionné{choisis.size > 1 ? 's' : ''}
              </span>
              <span className="text-xs text-iss-gray">— déplacer vers :</span>
              {colonnes.map(c => (
                <button key={c.cle} onClick={() => deplacerVers(c.id)}
                        className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90"
                        style={{ background: c.id === null ? '#64748b' : VERT }}>
                  {c.libelle}
                </button>
              ))}
              <button onClick={() => setChoisis(new Set())}
                      className="ml-auto text-xs text-iss-gray hover:text-iss-dark">
                Tout désélectionner
              </button>
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {colonnes.map(colonne => (
              <div key={colonne.cle} className={`${CARTE} overflow-hidden`}
                   style={colonne.id === null && colonne.inscrits.length > 0
                     ? { borderColor: 'rgba(200,32,32,0.35)' } : undefined}>
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-iss-dark">{colonne.libelle}</span>
                    <span className="text-xs tabular-nums px-1.5 py-0.5 rounded"
                          style={colonne.id === null && colonne.inscrits.length > 0
                            ? { background: 'rgba(200,32,32,0.12)', color: ROUGE }
                            : { background: 'rgba(0,102,51,0.10)', color: VERT }}>
                      {colonne.inscrits.length}
                    </span>
                  </div>
                  {colonne.inscrits.length > 0 && (
                    <button
                      onClick={() => setChoisis(precedent => {
                        const suivant = new Set(precedent);
                        const tous = colonne.inscrits.every(i => suivant.has(i.id));
                        for (const i of colonne.inscrits) {
                          if (tous) suivant.delete(i.id); else suivant.add(i.id);
                        }
                        return suivant;
                      })}
                      className="text-xs text-iss-primary hover:underline">
                      {colonne.inscrits.every(i => choisis.has(i.id)) && colonne.inscrits.length
                        ? 'Désélectionner' : 'Tout prendre'}
                    </button>
                  )}
                </div>

                {colonne.inscrits.length === 0 ? (
                  <p className="px-4 py-6 text-xs text-iss-gray text-center">
                    {colonne.id === null ? 'Tout le monde est affecté.' : 'Groupe vide.'}
                  </p>
                ) : (
                  <ul className="divide-y divide-gray-50 max-h-[26rem] overflow-y-auto">
                    {colonne.inscrits.map(inscrit => {
                      const choisi = choisis.has(inscrit.id);
                      const deplace = inscrit.id in brouillon
                        && brouillon[inscrit.id] !== inscrit.sous_groupe;
                      return (
                        <li key={inscrit.id}>
                          <button onClick={() => basculer(inscrit.id)}
                                  className="w-full text-left px-4 py-2 flex items-center gap-2 hover:bg-gray-50/70 transition-colors"
                                  style={choisi ? { background: 'rgba(0,102,51,0.07)' } : undefined}>
                            <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border"
                                  style={choisi
                                    ? { background: VERT, borderColor: VERT }
                                    : { borderColor: '#cbd5e1' }}>
                              {choisi && <Check size={11} className="text-white" />}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm text-iss-dark truncate">
                                {inscrit.etudiant_nom}
                              </span>
                              <span className="block text-xs text-iss-gray tabular-nums">
                                {inscrit.etudiant_matricule}
                              </span>
                            </span>
                            {/* Le point signale ce qui n'est pas encore enregistré. */}
                            {deplace && (
                              <span className="h-1.5 w-1.5 rounded-full shrink-0"
                                    style={{ background: VERT }} title="Non enregistré" />
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            ))}
          </div>

          {/* Le pied ne s'affiche qu'en cas de changement : sinon il n'y a rien
              à enregistrer, et un bouton inerte induit en erreur. */}
          {modifications.length > 0 && (
            <div className={`${CARTE} px-4 py-3 flex flex-wrap items-center gap-3 sticky bottom-2`}
                 style={{ borderLeft: `3px solid ${VERT}` }}>
              <span className="text-sm text-iss-dark">
                <strong className="tabular-nums">{modifications.length}</strong> changement
                {modifications.length > 1 ? 's' : ''} en attente
              </span>
              <button onClick={() => { setBrouillon({}); setChoisis(new Set()); }}
                      className={BTN_SECONDAIRE}>
                <RotateCcw size={14} /> Annuler
              </button>
              <button onClick={enregistrer} disabled={affecterGroupes.isPending}
                      className={BTN_PRIMAIRE} style={{ background: DEGRADE }}>
                <Save size={14} />
                {affecterGroupes.isPending ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          )}
        </>
      )}

      <Toast message={toast} />
    </div>
  );
}
