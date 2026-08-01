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
import { Ban, Layers, Repeat, X } from 'lucide-react';

import {
  BTN_PRIMAIRE, BTN_SECONDAIRE, CARTE, Chargement, DEGRADE, INPUT,
  SELECT, Vide,
} from '../_ui';
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
export function ModalePermutation({
  seance, candidates, onFerme, onFait,
}: {
  seance: SeanceReelle; candidates: SeanceReelle[];
  onFerme: () => void; onFait: (m: string) => void;
}) {
  const { create } = usePermutationProfMutations();
  const [cible, setCible]     = useState<number | null>(candidates[0]?.id ?? null);
  const [nbSemaines, setNbSemaines] = useState('1');
  const [motif, setMotif]     = useState('');
  const [directe, setDirecte] = useState(false);
  const [erreur, setErreur]   = useState<string | null>(null);

  const enregistrer = () => {
    if (!cible) { setErreur('Choisissez la séance à permuter.'); return; }
    setErreur(null);
    create.mutate(
      {
        seance_a: seance.id, seance_b: cible,
        nb_semaines: Number(nbSemaines) || 1,
        motif, action_directe: directe,
      },
      {
        onSuccess: () => onFait(directe
          ? 'Permutation validée — à appliquer depuis l\'écran Permutations'
          : 'Demande de permutation enregistrée'),
        onError: (e) => setErreur(e instanceof Error ? e.message : 'Erreur'),
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
              Le créneau est conservé : ce sont l&apos;enseignant, la salle et la matière qui s&apos;échangent.
            </p>
          </div>
          <button onClick={onFerme} className="p-1 rounded-lg text-iss-gray hover:bg-gray-100 transition-colors">
            <X size={14} />
          </button>
        </div>

        <div className="p-3 rounded-xl bg-gray-50 border border-gray-100 mb-3">
          <p className="text-xs font-semibold text-iss-gray uppercase tracking-wide mb-1">Séance de départ</p>
          <p className="text-sm font-bold text-iss-dark">
            {seance.matiere_code} · {seance.prof_nom || 'sans enseignant'} · {seance.salle_nom || 'sans salle'}
          </p>
          <p className="text-xs text-iss-gray">
            {seance.jour_libelle} {seance.creneau_libelle} — semaine {seance.semaine_numero}
          </p>
        </div>

        {candidates.length === 0 ? (
          <p className="text-sm text-amber-700 mb-3">
            Aucune autre séance sur ce créneau dans la classe. La permutation exige deux séances
            du même créneau — typiquement deux TP dédoublés.
          </p>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-iss-dark mb-1.5">Séance à échanger</label>
              <select value={cible ?? ''} className={SELECT}
                      onChange={e => setCible(e.target.value ? Number(e.target.value) : null)}>
                {candidates.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.matiere_code} · {s.prof_nom || 'sans enseignant'}
                    {s.sous_groupe_libelle && ` · ${s.sous_groupe_libelle}`}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-iss-dark mb-1.5">Portée (semaines)</label>
              <input type="number" min={1} max={40} value={nbSemaines} className={INPUT} style={{ width: 110 }}
                     onChange={e => setNbSemaines(e.target.value)} />
              <p className="text-xs text-iss-gray mt-1">
                1 = cette semaine seulement. Au-delà, l&apos;échange se répète sur les semaines suivantes.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-iss-dark mb-1.5">Motif</label>
              <input value={motif} className={INPUT} placeholder="Mission, indisponibilité…"
                     onChange={e => setMotif(e.target.value)} />
            </div>

            <label className="flex items-start gap-2 text-sm text-iss-dark cursor-pointer">
              <input type="checkbox" checked={directe} onChange={e => setDirecte(e.target.checked)}
                     className="w-4 h-4 mt-0.5 accent-[#006633]" />
              <span>
                Action directe du directeur
                <span className="block text-xs text-iss-gray">
                  Sans cette option, la demande suit le circuit : accord de la contrepartie,
                  puis validation du directeur.
                </span>
              </span>
            </label>
          </div>
        )}

        {erreur && <p className="mt-3 text-sm text-red-600">{erreur}</p>}

        <div className="flex gap-2 mt-5">
          <button onClick={enregistrer} disabled={create.isPending || candidates.length === 0}
                  className={BTN_PRIMAIRE} style={{ background: DEGRADE }}>
            <Repeat size={14} /> {directe ? 'Permuter' : 'Demander la permutation'}
          </button>
          <button onClick={onFerme} className={BTN_SECONDAIRE}>Annuler</button>
        </div>
      </div>
    </div>
  );
}
