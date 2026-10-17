'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Loader2, AlertCircle, Check, CheckCircle,
  Users, Search,
} from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { getStoredUser } from '@/lib/auth';
import { bulkPresences } from '@/lib/api/absences';
import { safeNextUrl } from '@/lib/safe-redirect';
import {
  estVerrouille, libelleBilan, lienAppel, peutSanctionner, presencesAEnvoyer, seanceSuivante,
  statutSuivant, type PresenceEnregistree,
} from '@/lib/salle-appel';
import { StatutPresence } from '@/types/absences';

/* La séance (un `Suivie` — l'adresse garde son nom historique `suiviId`). */
interface SeanceDetail {
  id: number;
  jour_label: string | null;
  creneau_label: string | null;
  type_seance_label: string | null;
  prof_nom: string | null;
  em_intitule: string | null;
  salle_nom: string | null;
  dept_nom?: string | null;
  groupe?: string | null;
  sous_groupe?: boolean;
  departement: number | null;
  /** La classe de la séance (celle du sous-groupe pour un TP). */
  classe?: number | null;
  numero_semaine: number;
  type_semestre: string;
  annee_universitaire: string;
}

/* Une ligne de la liste d'appel (`apps/ipgei/liste_appel.py`) : `mention`
   dit l'auditeur libre, ou l'étudiant déjà pointé qui n'est plus sur la liste
   (abandon déclaré après coup). */
interface LigneAppel {
  id: number; matricule: string; nom: string;
  mention: string;
}

interface SaisieSeance {
  seance: SeanceDetail;
  etudiants: LigneAppel[];
  liste_non_verifiee: boolean;
  presences: Record<string, PresenceEnregistree & { justificatif: boolean }>;
  refus: string;
}

/* Une couleur et une lettre par statut ; le présent garde sa coche. Tout ce
   qui n'est pas « présent » se voit : une justification saisie ailleurs
   s'affichait en vert, et l'appel la défaisait sans qu'on s'en aperçoive. */
const ASPECT: Record<number, { couleur: string; fond: string; lettre: string; libelle: string }> = {
  [StatutPresence.Present]:    { couleur: '#006633', fond: 'rgba(0,102,51,0.03)',   lettre: '',  libelle: 'Présent' },
  [StatutPresence.Absent]:     { couleur: '#C82020', fond: 'rgba(200,32,32,0.04)',  lettre: 'A', libelle: 'Absent' },
  [StatutPresence.Sanctionne]: { couleur: '#B8960C', fond: 'rgba(184,150,12,0.06)', lettre: 'S', libelle: 'Sanctionné' },
  [StatutPresence.Justifiee]:  { couleur: '#1a5c8f', fond: 'rgba(26,92,143,0.05)',  lettre: 'J', libelle: 'Absence justifiée' },
};

function PointageSalleContent() {
  const { suiviId }  = useParams<{ suiviId: string }>();
  const router       = useRouter();
  const searchParams = useSearchParams();
  // Venu de la vue de surveillance : on y revient sur la journée qu'on
  // regardait. Chemin interne seulement (safeNextUrl).
  const retourParam = searchParams.get('retour');
  const retour = safeNextUrl(retourParam, '/dashboard/absences/saisir/salle');
  const depuisSurveillance = !!retourParam && retour === retourParam;
  const user = getStoredUser();
  const annee = user?.annee_universitaire ?? '';
  // P/A pour tous, P/A/S pour qui requalifie. J jamais ici : elle se pose
  // dans « Justificatifs », avec sa pièce.
  const sanctionne = peutSanctionner(user?.role);

  const [statuts, setStatuts] = useState<Map<number, number>>(new Map());
  const [query,   setQuery]   = useState('');
  // L'appel enregistré : l'heure, et s'il a été retouché depuis. On RESTE sur
  // la séance — l'écran « Séance validée ! » qui repartait seul au bout de
  // deux secondes cachait le bilan et empêchait de corriger (17/10/2026).
  const [enregistreA, setEnregistreA] = useState<string | null>(null);
  const [modifie,     setModifie]     = useState(false);
  const [ignorees,    setIgnorees]    = useState(0);
  const [error,   setError]   = useState<string | null>(null);

  /* ─── La séance, sa liste d'appel et le déjà saisi : UNE requête ──
     La liste est celle de la séance — la classe pour un cours, le
     sous-groupe pour un TP. Lue sous `abs_saisie` : le détail
     `/suivi/suivies/<id>/` exigeait `suivi_saisie` et un groupe délégué, et
     les étudiants venaient de `Etudiant.departement` — vide pour un TP. */
  const saisieQuery = useQuery({
    queryKey: ['absences', 'saisie-seance', suiviId] as const,
    queryFn:  () => apiFetch<SaisieSeance>(`/api/v1/absences/presences/saisie-seance/?seance=${suiviId}`),
    enabled:  !!suiviId,
  });
  const seance = saisieQuery.data?.seance ?? null;
  const refus = saisieQuery.data?.refus ?? '';
  const deja = useMemo(() => saisieQuery.data?.presences ?? {}, [saisieQuery.data]);
  const etudiants = useMemo(() => saisieQuery.data?.etudiants ?? [], [saisieQuery.data]);
  // L'appel de cette séance avait-il déjà été fait à l'ouverture de l'écran ?
  const dejaFait = Object.keys(deja).length > 0;

  /* ─── La séance suivante du même jour, pour enchaîner les appels ──
     Lue sur la journée de la CLASSE (ses TP compris) : la liste du mode salle
     d'où l'on vient, dans le même ordre. */
  const classeId = seance ? (seance.classe ?? seance.departement) : null;
  const voisinesQuery = useQuery({
    queryKey: ['absences', 'fiches-seances', 'voisines',
               seance?.annee_universitaire, seance?.type_semestre, seance?.numero_semaine, classeId] as const,
    queryFn:  () => apiFetch<{ id: number; jour_label: string | null; creneau_label: string | null;
                                em_intitule: string | null }[]>(
      `/api/v1/absences/presences/fiches-seances/?annee_universitaire=${encodeURIComponent(seance?.annee_universitaire ?? annee)}`
      + `&type_semestre=${seance?.type_semestre ?? ''}&numero_semaine=${seance?.numero_semaine}`
      + `&departement=${classeId}`),
    enabled: !!seance && classeId != null,
  });
  const suivante = useMemo(
    () => (seance ? seanceSuivante(voisinesQuery.data ?? [], seance.id, seance.jour_label) : null),
    [voisinesQuery.data, seance]);

  // Les statuts partent de ce qui est enregistré ; « Présent » pour les autres.
  useEffect(() => {
    if (!saisieQuery.data) return;
    const map = new Map<number, number>();
    etudiants.forEach(e => map.set(e.id, deja[String(e.id)]?.statut ?? StatutPresence.Present));
    setStatuts(map);
  }, [etudiants, deja, saisieQuery.data]);

  const loading = saisieQuery.isLoading;
  const queryError = saisieQuery.error;
  useEffect(() => {
    if (queryError) setError(queryError instanceof Error ? queryError.message : 'Erreur de chargement.');
  }, [queryError]);

  /* ─── Toggle étudiant ── */
  function toggle(etuId: number) {
    setStatuts(prev => {
      const cur = prev.get(etuId) ?? StatutPresence.Present;
      const next = statutSuivant(cur, sanctionne);
      if (next === cur) return prev;
      setModifie(true);
      return new Map(prev).set(etuId, next);
    });
  }

  /* ─── Statistiques ── */
  const compter = (s: number) => [...statuts.values()].filter(x => x === s).length;
  const nbPresents   = compter(StatutPresence.Present);
  const nbAbsents    = compter(StatutPresence.Absent);
  const nbSanctions  = compter(StatutPresence.Sanctionne);
  const nbJustifiees = compter(StatutPresence.Justifiee);

  /* ─── Filtrage par recherche ── */
  const filtered = query.trim().length > 0
    ? etudiants.filter(e =>
        e.nom.toLowerCase().includes(query.toLowerCase()) ||
        e.matricule.toLowerCase().includes(query.toLowerCase()),
      )
    : etudiants;

  /* ─── Validation ── */
  const qc = useQueryClient();
  const validateMut = useMutation({
    // Seulement ce qui change, ou n'a pas encore de ligne ; le commentaire
    // déjà saisi repart tel quel (17/10/2026).
    mutationFn: () => bulkPresences({
      suivi_id: Number(suiviId),
      presences: presencesAEnvoyer(etudiants, statuts, deja),
    }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['absences'] });
      setEnregistreA(new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }));
      setModifie(false);
      setIgnorees((r.justifiees_preservees ?? 0) + (r.justifiees_refusees ?? 0));
    },
    onError: (err: unknown) => {
      setError(err instanceof Error ? err.message : 'Erreur lors de la validation.');
    },
  });
  const saving = validateMut.isPending;

  function handleValidate() {
    if (!suiviId) return;
    if (refus) { setError(refus); return; }
    setError(null);
    validateMut.mutate();
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 size={32} className="animate-spin text-gray-300" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header sticky */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100 shadow-sm">
        <div className="flex items-center gap-3 px-4 py-3">
          <button onClick={() => (depuisSurveillance ? router.push(retour) : router.back())}
            className="p-2 rounded-xl text-gray-500 hover:bg-gray-100 transition-colors">
            <ArrowLeft size={20} />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-gray-900 truncate">
              {seance?.em_intitule || 'Séance'}
            </p>
            <p className="text-xs text-gray-500 truncate">
              {[seance?.type_seance_label, seance?.sous_groupe ? seance?.dept_nom : null,
                seance?.jour_label, seance?.creneau_label, seance?.prof_nom]
                .filter(Boolean).join(' · ')}
            </p>
          </div>
        </div>

        {/* Compteur — sanctionnés toujours affichés : un compteur qui
            disparaît à zéro passe pour un statut inexistant. */}
        <div className="flex border-t border-gray-50">
          <div className="flex-1 py-2.5 text-center border-r border-gray-50">
            <p className="text-lg font-extrabold text-[#006633]">{nbPresents}</p>
            <p className="text-[10px] text-gray-400 uppercase tracking-wide">Présents</p>
          </div>
          <div className="flex-1 py-2.5 text-center">
            <p className="text-lg font-extrabold text-[#C82020]">{nbAbsents}</p>
            <p className="text-[10px] text-gray-400 uppercase tracking-wide">Absents</p>
          </div>
          <div className="flex-1 py-2.5 text-center border-l border-gray-50">
            <p className="text-lg font-extrabold text-[#B8960C]">{nbSanctions}</p>
            <p className="text-[10px] text-gray-400 uppercase tracking-wide">Sanctionnés</p>
          </div>
          {nbJustifiees > 0 && (
            <div className="flex-1 py-2.5 text-center border-l border-gray-50">
              <p className="text-lg font-extrabold text-[#1a5c8f]">{nbJustifiees}</p>
              <p className="text-[10px] text-gray-400 uppercase tracking-wide">Justifiés</p>
            </div>
          )}
        </div>

        {/* Recherche */}
        <div className="px-4 pb-3">
          <div className="relative flex items-center">
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Rechercher par matricule ou nom…"
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-gray-200 text-sm bg-gray-50 focus:outline-none"
            />
            <Search size={14} className="absolute left-3 text-gray-400 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* L'état de l'appel : on reste sur la séance, le bilan reste lisible. */}
      {enregistreA && !modifie && (
        <div className="mx-4 mt-3 flex items-start gap-2 p-3 rounded-xl bg-green-50 border border-green-200 text-sm text-green-800">
          <CheckCircle size={16} className="shrink-0 mt-0.5" />
          <span>
            <strong>Appel enregistré à {enregistreA}</strong> — {nbPresents} présent{nbPresents > 1 ? 's' : ''},
            {' '}{nbAbsents} absent{nbAbsents > 1 ? 's' : ''}
            {nbSanctions > 0 && <>, {nbSanctions} sanctionné{nbSanctions > 1 ? 's' : ''}</>}
            {nbJustifiees > 0 && <>, {nbJustifiees} justifié{nbJustifiees > 1 ? 's' : ''}</>}.
            {' '}Touchez un étudiant pour corriger.
          </span>
        </div>
      )}
      {enregistreA && !modifie && ignorees > 0 && (
        <div className="mx-4 mt-3 flex items-center gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-800">
          <AlertCircle size={16} /> {ignorees} ligne{ignorees > 1 ? 's' : ''} non
          {ignorees > 1 ? ' modifiées' : ' modifiée'} par le serveur : une absence justifiée ne se
          change que dans « Justificatifs ».
        </div>
      )}
      {modifie && (enregistreA || dejaFait) && (
        <div className="mx-4 mt-3 flex items-center gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-800">
          <AlertCircle size={16} /> Corrections non enregistrées.
        </div>
      )}
      {dejaFait && !enregistreA && !modifie && (
        <div className="mx-4 mt-3 flex items-center gap-2 p-3 rounded-xl bg-blue-50 border border-blue-200 text-sm text-blue-800">
          <CheckCircle size={16} /> L&apos;appel de cette séance a déjà été fait. Touchez un étudiant pour le corriger.
        </div>
      )}
      {saisieQuery.data?.liste_non_verifiee && (
        <div className="mx-4 mt-3 flex items-center gap-2 p-3 rounded-xl bg-gray-100 border border-gray-200 text-xs text-gray-600">
          <AlertCircle size={14} /> Ce groupe n&apos;est ni une classe ni un sous-groupe : la liste est celle du département.
        </div>
      )}

      {/* Erreur, ou séance où l'appel est impossible */}
      {(error || refus) && (
        <div className="mx-4 mt-3 flex items-center gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">
          <AlertCircle size={16} /> {error || refus}
        </div>
      )}

      {/* Liste étudiants */}
      <div className="flex-1 p-4 space-y-2">
        {filtered.length === 0 && (
          <div className="text-center py-12">
            <Users size={32} className="mx-auto mb-3 text-gray-200" />
            <p className="text-sm text-gray-400">Aucun étudiant trouvé</p>
          </div>
        )}
        {filtered.map(etu => {
          const statut = statuts.get(etu.id) ?? StatutPresence.Present;
          const aspect = ASPECT[statut] ?? ASPECT[StatutPresence.Present];
          const fige = estVerrouille(statut, sanctionne);

          return (
            <div key={etu.id}
              className="rounded-2xl border transition-all"
              style={{
                background: aspect.fond,
                borderColor: statut === StatutPresence.Present ? '#e2e8f0' : aspect.couleur,
              }}>
              <button
                onClick={() => toggle(etu.id)}
                disabled={fige}
                title={statut === StatutPresence.Justifiee
                  ? 'Absence justifiée — elle se modifie dans « Justificatifs ».'
                  : fige ? 'Absence requalifiée par la direction : non modifiable ici.'
                  : sanctionne ? 'Présent → Absent → Sanctionné' : 'Présent ↔ Absent'}
                className="w-full flex items-center gap-3 px-4 py-3 text-left disabled:cursor-not-allowed"
                style={{ minHeight: '64px' }}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{etu.nom}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {etu.matricule}
                    {etu.mention && (
                      <span className="ml-1.5 px-1.5 rounded bg-amber-100 text-amber-800 text-[10px] font-semibold">
                        {etu.mention}
                      </span>
                    )}
                  </p>
                </div>
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: aspect.couleur }}
                  title={aspect.libelle}
                >
                  {aspect.lettre
                    ? <span className="text-white text-xs font-bold">{aspect.lettre}</span>
                    : <Check size={16} className="text-white" />
                  }
                </div>
              </button>

              {/* Pas d'upload de justificatif en mode salle — réservé au DA */}
            </div>
          );
        })}
      </div>

      {/* Bouton Valider — collé au bas de la colonne de contenu, pas de la
          fenêtre : en `fixed`, il passait sous le menu latéral. */}
      <div className="sticky bottom-0 z-10 bg-white border-t border-gray-100 p-4 shadow-xl">
        {enregistreA && !modifie ? (
          // Appel enregistré : on enchaîne — séance suivante du jour, ou la liste.
          <div className="flex gap-2">
            <Link href={retour}
              className="flex-1 flex items-center justify-center gap-2 py-4 rounded-2xl text-sm font-bold border border-gray-200 text-gray-700 hover:bg-gray-50">
              <ArrowLeft size={18} /> {depuisSurveillance ? 'Surveillance' : 'Séances'}
            </Link>
            {suivante && (
              <Link href={lienAppel(suivante.id, depuisSurveillance ? retour : null)}
                className="flex-[2] flex items-center justify-center gap-2 py-4 rounded-2xl text-sm font-bold text-white"
                style={{ background: 'linear-gradient(135deg, #006633, #008844)' }}
                title={suivante.em_intitule ?? ''}>
                Séance suivante · {suivante.creneau_label ?? ''} <ArrowLeft size={18} className="rotate-180" />
              </Link>
            )}
          </div>
        ) : (
          <button
            onClick={handleValidate}
            disabled={saving || !!refus || etudiants.length === 0}
            className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl text-base font-bold text-white transition-all disabled:opacity-60 active:scale-[0.98]"
            style={{ background: 'linear-gradient(135deg, #006633, #008844)' }}
          >
            {saving
              ? <><Loader2 size={20} className="animate-spin" /> Enregistrement…</>
              : <><CheckCircle size={20} />
                  {enregistreA || dejaFait ? 'Enregistrer les corrections' : 'Valider la séance'}
                  {' '}· {libelleBilan({ presents: nbPresents, absents: nbAbsents,
                                        sanctions: nbSanctions, justifiees: nbJustifiees })}</>
            }
          </button>
        )}
      </div>
    </div>
  );
}

export default function PointageSallePage() {
  return (
    <Suspense fallback={
      <div className="p-6 flex items-center justify-center">
        <Loader2 size={20} className="animate-spin text-iss-primary" />
      </div>
    }>
      <PointageSalleContent />
    </Suspense>
  );
}
