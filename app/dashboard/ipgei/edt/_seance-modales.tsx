'use client';

/**
 * Modales d'édition d'une séance réelle, partagées par les écrans d'emploi du
 * temps.
 *
 * Extraites de l'écran hebdomadaire pour être réutilisées par la grille, qui
 * édite désormais aussi les semaines réelles. Ces gestes n'ont de sens que sur
 * une séance datée : on ne permute pas un patron, on ne fait pas l'appel sur
 * une case de modèle.
 */
import { useEffect, useState } from 'react';
import { ArrowRight, Ban, Layers, Repeat, X } from 'lucide-react';

import {
  BTN_PRIMAIRE, BTN_SECONDAIRE, CARTE, Chargement, DEGRADE, INPUT,
  SELECT, Vide,
} from '../_ui';
import { peutDeciderEdt } from '@/lib/auth';
import {
  useAbsenceMutations, useFeuilleAppel, usePermutationProfMutations,
  useSeanceMutations,
} from '@/lib/api/ipgei-hooks';
import {
  STATUTS_ABSENCE, type SeanceReelle, type StatutAbsence,
} from '@/types/ipgei';

export function ModaleEditionSeance({
  seance, profs, salles, onFerme, onFait,
}: {
  seance: SeanceReelle;
  profs: { id: number; nom: string }[];
  salles: { id: number; nom: string }[];
  onFerme: () => void; onFait: (m: string) => void;
}) {
  const { update, appliquerLot } = useSeanceMutations();
  const [prof, setProf]   = useState<number | null>(seance.prof);
  const [salle, setSalle] = useState<number | null>(seance.salle);
  const [annulee, setAnnulee] = useState(seance.annulee);
  const [enLot, setEnLot] = useState(false);
  const [nbSemaines, setNbSemaines] = useState('4');
  const [erreur, setErreur] = useState<string | null>(null);

  const echec = (e: unknown) => setErreur(e instanceof Error ? e.message : 'Erreur');

  const enregistrer = () => {
    setErreur(null);
    if (enLot) {
      appliquerLot.mutate(
        { id: seance.id, input: { nb_semaines: Number(nbSemaines) || 1, prof, salle, annulee } },
        {
          // Le compte des créations est distinct : reporter une séance sur des
          // semaines où la case était vide l'y ajoute, et un message ne
          // parlant que de modifications laissait croire à un échec.
          onSuccess: (r) => onFait(
            [
              r.seances_modifiees ? `${r.seances_modifiees} modifiée(s)` : '',
              r.seances_creees    ? `${r.seances_creees} ajoutée(s)`     : '',
            ].filter(Boolean).join(' · ')
            + ` sur ${r.semaines_traitees} semaine(s)`,
          ),
          onError: echec,
        },
      );
    } else {
      update.mutate(
        { id: seance.id, input: { prof, salle, annulee } },
        { onSuccess: () => onFait('Séance modifiée'), onError: echec },
      );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
         onClick={onFerme} role="presentation">
      <div className={`${CARTE} w-full max-w-md p-6`} onClick={e => e.stopPropagation()} role="presentation">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-bold text-iss-dark">
              {seance.matiere_code} — {seance.matiere_intitule}
            </h3>
            <p className="text-xs text-iss-gray">
              {seance.jour_libelle} · {seance.creneau_libelle}
              {seance.date && ` · ${new Date(seance.date).toLocaleDateString('fr-FR')}`}
            </p>
          </div>
          <button onClick={onFerme} className="p-1 rounded-lg text-iss-gray hover:bg-gray-100 transition-colors">
            <X size={14} />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-iss-dark mb-1.5">Enseignant</label>
            <select value={prof ?? ''} className={SELECT}
                    onChange={e => setProf(e.target.value ? Number(e.target.value) : null)}>
              <option value="">Non affecté</option>
              {profs.map(p => <option key={p.id} value={p.id}>{p.nom}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-iss-dark mb-1.5">Salle</label>
            <select value={salle ?? ''} className={SELECT}
                    onChange={e => setSalle(e.target.value ? Number(e.target.value) : null)}>
              <option value="">Non affectée</option>
              {salles.map(s => <option key={s.id} value={s.id}>{s.nom}</option>)}
            </select>
          </div>

          <label className="flex items-center gap-2 text-sm text-iss-dark cursor-pointer">
            <input type="checkbox" checked={annulee} onChange={e => setAnnulee(e.target.checked)}
                   className="w-4 h-4 accent-[#006633]" />
            <Ban size={13} className="text-iss-gray" /> Séance annulée
          </label>

          <div className="pt-2 border-t border-gray-100">
            <label className="flex items-start gap-2 text-sm text-iss-dark cursor-pointer">
              <input type="checkbox" checked={enLot} onChange={e => setEnLot(e.target.checked)}
                     className="w-4 h-4 mt-0.5 accent-[#006633]" />
              <span>
                <Layers size={12} className="inline mr-1 text-iss-gray" />
                Appliquer à plusieurs semaines
                <span className="block text-xs text-iss-gray">
                  Reporte la séance sur la même case horaire, et la crée là où
                  cette case est vide.
                </span>
              </span>
            </label>
            {enLot && (
              <>
                <div className="mt-2 flex items-center gap-2">
                  <input type="number" min={1} max={40} value={nbSemaines} className={INPUT}
                         style={{ width: 90 }} onChange={e => setNbSemaines(e.target.value)} />
                  <span className="text-xs text-iss-gray">semaines de cours</span>
                </div>
                {/* Le report part TOUJOURS de la semaine affichée et va vers
                    les suivantes. Sans ce rappel, on demande « 2 semaines »
                    depuis la semaine 2 en attendant les semaines 1 et 2. */}
                <p className="mt-2 text-xs px-2.5 py-2 rounded-lg"
                   style={{ background: 'rgba(124,58,237,0.07)', color: '#5b21b6' }}>
                  À partir de la <strong>semaine {seance.semaine_numero}</strong>, celle
                  affichée, puis les {Math.max(0, (Number(nbSemaines) || 1) - 1)} suivante(s).
                  Les semaines antérieures ne sont jamais touchées — pour couvrir une
                  semaine précédente, placez-vous d&apos;abord dessus.
                </p>
              </>
            )}
          </div>
        </div>

        {erreur && <p className="mt-3 text-sm text-red-600">{erreur}</p>}

        <div className="flex gap-2 mt-5">
          <button onClick={enregistrer} disabled={update.isPending || appliquerLot.isPending}
                  className={BTN_PRIMAIRE} style={{ background: DEGRADE }}>
            Enregistrer
          </button>
          <button onClick={onFerme} className={BTN_SECONDAIRE}>Annuler</button>
        </div>
      </div>
    </div>
  );
}

// ── Feuille d'appel « par exception » ────────────────────────────────────────
export function ModaleAppel({
  seance, onFerme, onFait,
}: { seance: SeanceReelle; onFerme: () => void; onFait: (m: string) => void }) {
  const { data, isLoading } = useFeuilleAppel(seance.id);
  const { saisir } = useAbsenceMutations();
  const [saisies, setSaisies] = useState<Record<number, StatutAbsence | null>>({});
  const [initialise, setInitialise] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  // On part de ce qui est déjà enregistré : tout le monde présent sauf les
  // lignes existantes.
  useEffect(() => {
    if (!data || initialise) return;
    const depart: Record<number, StatutAbsence | null> = {};
    for (const a of data.absents) depart[a.inscription] = a.statut;
    setSaisies(depart);
    setInitialise(true);
  }, [data, initialise]);

  const basculer = (inscription: number, statut: StatutAbsence) =>
    setSaisies(s => ({ ...s, [inscription]: s[inscription] === statut ? null : statut }));

  const enregistrer = () => {
    setErreur(null);
    const absents = Object.entries(saisies)
      .filter(([, statut]) => statut !== null)
      .map(([inscription, statut]) => ({
        inscription: Number(inscription), statut: statut as StatutAbsence,
      }));
    saisir.mutate({ seance: seance.id, absents }, {
      onSuccess: (r) => onFait(
        absents.length === 0
          ? 'Classe au complet enregistrée'
          : `${r.enregistrees} absence(s) enregistrée(s)`,
      ),
      onError: (e) => setErreur(e instanceof Error ? e.message : 'Erreur'),
    });
  };

  const nbAbsents = Object.values(saisies).filter(Boolean).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
         onClick={onFerme} role="presentation">
      <div className={`${CARTE} w-full max-w-xl p-6 max-h-[85vh] flex flex-col`}
           onClick={e => e.stopPropagation()} role="presentation">
        <div className="flex items-center justify-between mb-1">
          <div>
            <h3 className="text-sm font-bold text-iss-dark">Feuille d&apos;appel</h3>
            <p className="text-xs text-iss-gray">
              {seance.matiere_code} · {seance.jour_libelle} {seance.creneau_libelle}
              {seance.sous_groupe_libelle && ` · sous-groupe ${seance.sous_groupe_libelle}`}
            </p>
          </div>
          <button onClick={onFerme} className="p-1 rounded-lg text-iss-gray hover:bg-gray-100 transition-colors">
            <X size={14} />
          </button>
        </div>

        <p className="text-xs text-iss-gray mb-3 pb-3 border-b border-gray-100">
          Tout le monde est présent par défaut. Ne marquez que les exceptions —
          décocher une ligne remet l&apos;étudiant présent.
        </p>

        <div className="flex-1 overflow-y-auto -mx-1 px-1">
          {isLoading ? <Chargement /> : (data?.classe ?? []).length === 0 ? (
            <Vide texte="Aucun étudiant concerné par cette séance." />
          ) : (
            <div className="space-y-1">
              {(data?.classe ?? []).map(i => {
                const statut = saisies[i.id] ?? null;
                return (
                  <div key={i.id}
                       className={`flex items-center gap-2 px-3 py-2 rounded-xl border transition-all ${
                         statut ? 'border-amber-200 bg-amber-50/60' : 'border-gray-100'
                       }`}>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-iss-dark truncate">{i.etudiant_nom}</div>
                      <div className="text-xs text-iss-gray">{i.etudiant_matricule}</div>
                    </div>
                    <div className="flex gap-1">
                      {STATUTS_ABSENCE.map(s => (
                        <button key={s.value} onClick={() => basculer(i.id, s.value)}
                                className={`px-2 py-1 rounded-md border text-xs font-semibold transition-all ${
                                  statut === s.value
                                    ? 'bg-amber-500 text-white border-amber-500'
                                    : 'bg-white text-iss-gray border-gray-200 hover:border-amber-400'
                                }`}>
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {erreur && <p className="mt-3 text-sm text-red-600">{erreur}</p>}

        <div className="flex items-center gap-2 mt-4 pt-4 border-t border-gray-100">
          <button onClick={enregistrer} disabled={saisir.isPending}
                  className={BTN_PRIMAIRE} style={{ background: DEGRADE }}>
            Enregistrer l&apos;appel
          </button>
          <button onClick={onFerme} className={BTN_SECONDAIRE}>Annuler</button>
          <span className="ml-auto text-xs text-iss-gray">
            {nbAbsents === 0 ? 'Classe au complet' : `${nbAbsents} exception(s)`}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Demande de permutation d'enseignants ─────────────────────────────────────
/** Une séance telle qu'elle se lit dans l'échange : matière, enseignant, salle. */
function Trio({ seance }: { seance: SeanceReelle }) {
  return (
    <span className="text-sm">
      <span className="font-bold text-iss-dark">{seance.matiere_code}</span>
      <span className="text-iss-gray"> · {seance.prof_nom || 'sans enseignant'}</span>
      {seance.salle_nom && <span className="text-iss-gray"> · {seance.salle_nom}</span>}
    </span>
  );
}

/**
 * Permutation d'enseignants — tout se décide ici.
 *
 * Le clic sur ⇄ ouvre directement cette fenêtre avec les échanges possibles :
 * le serveur exige deux séances de la même classe et du même créneau, la liste
 * des candidates est donc connue d'avance. Faire désigner la seconde dans la
 * grille obligeait à un aller-retour pour une information que l'écran avait
 * déjà.
 *
 * Le bouton dépend du rôle et non d'une case à cocher : la direction permute
 * sur-le-champ, les autres déposent une demande qui suivra son circuit.
 */
export function ModalePermutation({
  depart, candidats, onFerme, onFait,
}: {
  depart: SeanceReelle; candidats: SeanceReelle[];
  onFerme: () => void; onFait: (m: string) => void;
}) {
  const { create, permuterMaintenant } = usePermutationProfMutations();
  // Une seule possibilité — deux TP dédoublés, le cas courant — ne mérite pas
  // qu'on fasse choisir : elle est retenue d'emblée.
  const [cible, setCible]   = useState<SeanceReelle | null>(
    candidats.length === 1 ? candidats[0] : null);
  // Même portée que le report d'une séance et que la duplication d'emploi du
  // temps : cette semaine, ou un lot de N semaines à partir d'elle. Trois
  // écrans, un seul vocabulaire.
  const [enLot, setEnLot]         = useState(false);
  const [nbSemaines, setNbSemaines] = useState('4');
  const [motif, setMotif]         = useState('');
  const [erreur, setErreur] = useState<string | null>(null);

  const tranche  = peutDeciderEdt();
  const mutation = tranche ? permuterMaintenant : create;

  const enregistrer = () => {
    if (!cible) { setErreur('Choisissez la séance à échanger.'); return; }
    setErreur(null);
    mutation.mutate(
      { seance_a: depart.id, seance_b: cible.id,
        nb_semaines: enLot ? Number(nbSemaines) || 1 : 1, motif,
        ...(tranche ? {} : { action_directe: false }) },
      {
        onSuccess: (r: { seances_impactees?: number }) => onFait(tranche
          ? `Permutation appliquée — ${r?.seances_impactees ?? 0} séance(s) touchée(s)`
          : 'Demande de permutation envoyée'),
        onError: (e: unknown) => setErreur(e instanceof Error ? e.message : 'Erreur'),
      },
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
         onClick={onFerme} role="presentation">
      <div className={`${CARTE} w-full max-w-lg p-6`} onClick={e => e.stopPropagation()} role="presentation">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-bold text-iss-dark">Permuter les enseignants</h3>
            <p className="text-xs text-iss-gray">
              Les créneaux ne bougent pas : ce sont l&apos;enseignant, la salle et la
              matière qui s&apos;échangent.
            </p>
          </div>
          <button onClick={onFerme} className="p-1 rounded-lg text-iss-gray hover:bg-gray-100 transition-colors">
            <X size={14} />
          </button>
        </div>

        {/* La séance de départ, rappelée : on a cliqué une case, il faut
            pouvoir vérifier laquelle sans refermer la fenêtre. */}
        <div className="p-3 rounded-xl bg-gray-50 border border-gray-100 mb-3">
          <p className="text-xs font-semibold text-iss-gray uppercase tracking-wide mb-1">
            Séance de départ
          </p>
          <Trio seance={depart} />
          <p className="text-xs text-iss-gray mt-0.5">
            {depart.jour_libelle} {depart.creneau_libelle}
            {depart.sous_groupe_libelle && ` · ${depart.sous_groupe_libelle}`}
          </p>
        </div>

        {candidats.length === 0 ? (
          <p className="text-sm text-amber-700 mb-3">
            Aucune autre séance sur {depart.creneau_libelle} dans cette classe.
            La permutation exige deux séances du même créneau — typiquement deux
            TP dédoublés, ou deux cours placés au même horaire des jours
            différents.
          </p>
        ) : (
        <div className="space-y-3">
          {/* Plusieurs possibilités : on les montre entières plutôt qu'en
              libellés dans un menu — c'est l'enseignant et le jour qui font
              choisir, pas le code de la matière. */}
          {candidats.length > 1 && (
            <div>
              <label className="block text-xs font-semibold text-iss-dark mb-1.5">
                Échanger avec
              </label>
              <div className="space-y-1.5 max-h-52 overflow-y-auto">
                {candidats.map(c => (
                  <button key={c.id} onClick={() => setCible(c)}
                          className={`w-full text-left px-3 py-2 rounded-xl border transition-colors ${
                            cible?.id === c.id
                              ? 'border-[#7c3aed] bg-[#7c3aed]/6'
                              : 'border-gray-200 hover:border-[#7c3aed]/40'}`}>
                    <Trio seance={c} />
                    <p className="text-xs text-iss-gray mt-0.5">
                      {c.jour_libelle} {c.creneau_libelle}
                      {c.sous_groupe_libelle && ` · ${c.sous_groupe_libelle}`}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* L'échange tel qu'il sera, ligne à ligne : on confirmait sans voir
              le résultat. */}
          {cible && (
            <div className="rounded-xl border border-gray-200 divide-y divide-gray-100">
              {[[depart, cible], [cible, depart]].map(([avant, apres]) => (
                <div key={avant.id} className="px-4 py-3">
                  <p className="text-xs text-iss-gray mb-1">
                    {avant.jour_libelle} {avant.creneau_libelle}
                    {avant.sous_groupe_libelle && ` · ${avant.sous_groupe_libelle}`}
                  </p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Trio seance={avant} />
                    <ArrowRight size={13} className="text-[#7c3aed] flex-shrink-0" />
                    <Trio seance={apres} />
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="pt-1 border-t border-gray-100">
            <label className="flex items-start gap-2 text-sm text-iss-dark cursor-pointer">
              <input type="checkbox" checked={enLot} onChange={e => setEnLot(e.target.checked)}
                     className="w-4 h-4 mt-0.5 accent-[#7c3aed]" />
              <span>
                <Layers size={12} className="inline mr-1 text-iss-gray" />
                Appliquer à plusieurs semaines
                <span className="block text-xs text-iss-gray">
                  Sans cette option, l&apos;échange ne vaut que pour la semaine affichée.
                </span>
              </span>
            </label>
            {enLot && (
              <div className="mt-2 flex items-center gap-2">
                <input type="number" min={1} max={40} value={nbSemaines} className={INPUT}
                       style={{ width: 90 }} onChange={e => setNbSemaines(e.target.value)} />
                <span className="text-xs text-iss-gray">
                  semaines de cours, à partir de celle-ci
                </span>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-iss-dark mb-1.5">
              Motif <span className="font-normal text-iss-gray">(facultatif)</span>
            </label>
            <input value={motif} className={INPUT} placeholder="Mission, indisponibilité…"
                   onChange={e => setMotif(e.target.value)} />
          </div>
        </div>
        )}

        {erreur && <p className="mt-3 text-sm text-red-600">{erreur}</p>}

        <div className="flex gap-2 mt-5">
          <button onClick={enregistrer}
                  disabled={mutation.isPending || !cible}
                  className={BTN_PRIMAIRE} style={{ background: DEGRADE }}>
            <Repeat size={14} />
            {mutation.isPending ? 'En cours…' : tranche ? 'Permuter' : 'Demander la permutation'}
          </button>
          <button onClick={onFerme} className={BTN_SECONDAIRE}>Annuler</button>
        </div>

        {!tranche && candidats.length > 0 && (
          <p className="text-xs text-iss-gray mt-3">
            La demande suit son circuit : accord de la contrepartie, puis validation
            de la direction.
          </p>
        )}
      </div>
    </div>
  );
}
