'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Ban, CalendarRange, CheckCircle, ChevronLeft, ChevronRight, CopyPlus,
  Loader2, Lock, Repeat, Save, Trash2, UserX, X,
} from 'lucide-react';

import {
  BTN_PRIMAIRE, BTN_SECONDAIRE, Badge, CARTE, Chargement, DEGRADE, EnTetePage,
  Erreur, INPUT, SELECT, VERT, Vide,
} from '../../_ui';
import { anneeParDefaut, typeSemestreSession } from '../../_annee';
import { useReferentielsEDT } from '../_referentiels';
import {
  STYLE_CELLULE, STYLE_CELLULE_JOUR, STYLE_ENTETE_CRENEAU, STYLE_ENTETE_JOUR,
  STYLE_ENTETE_LIGNE, STYLE_TABLE, couleurType,
} from '../_cellule';
import { AC, type OptionAC } from '../_autocomplete';
import {
  ipgeiKeys, useClassesSelect, useEdtSemaine, useGrilleMutations,
  useGrillePourClasse, useMatieresSelect, useSemaines, useSemestresAll,
  useSousGroupes,
} from '@/lib/api/ipgei-hooks';
import { seancesApi, seancesTypeApi } from '@/lib/api/ipgei';
import { type SeanceReelle, type TypeSemestre } from '@/types/ipgei';
import {
  ModaleAppel, ModaleEditionSeance, ModalePermutation,
} from '../_seance-modales';
import { BandeauCoherence } from '../_consultation';

/**
 * Une case de la grille peut porter plusieurs séances : deux TP dédoublés
 * occupent le même créneau, sur des sous-groupes différents et souvent dans des
 * matières différentes. La clé d'un emplacement inclut donc le sous-groupe.
 */
interface Emplacement {
  matiereId:  string;
  profId:     string;
  salleId:    string;
  /** `''` tant que le type n'a pas été choisi : aucun n'est présumé. */
  /** Identifiant du type dans « Paramètres → Séances », '' si non choisi. */
  typeSeance: string;
  idOrigine:  number | null;
  /** Séance réelle annulée — sans objet sur la grille type. */
  annulee?:   boolean;
}

const VIDE: Emplacement = {
  matiereId: '', profId: '', salleId: '', typeSeance: '', idOrigine: null,
};

/** `sousGroupe` vide = séance de la classe entière. */
const cle = (jour: number, creneau: number, sousGroupe: string) =>
  `${jour}__${creneau}__${sousGroupe}`;

export default function GrilleTypePage() {
  const qc = useQueryClient();

  // Année et période viennent de la session ouverte : ce sont les mêmes que
  // celles choisies à la connexion, et les redemander ici permettrait d'éditer
  // une période différente de celle qu'on croit consulter.
  const annee = anneeParDefaut();
  const typeSemestre = typeSemestreSession() as TypeSemestre;

  const [classeId, setClasseId] = useState<number | null>(null);
  /**
   * Période éditée : `null` = la grille type (le patron), sinon une semaine
   * réelle.
   *
   * Un seul écran pour les deux : la distinction patron / semaine est une
   * notion de modèle de données, pas un geste utilisateur. Modifier l'emploi
   * du temps reste le même geste ; seule change sa portée, d'où un sélecteur
   * plutôt que deux écrans.
   */
  const [periodeId, setPeriodeId] = useState<number | null>(null);

  const { data: classes = [] } = useClassesSelect({ annee_universitaire: annee, actif: true });
  const classe = classes.find(c => c.id === classeId);

  const { data: grille, isLoading, error: erreurGrille } = useGrillePourClasse(classeId, typeSemestre);
  const grilleId = grille?.id ?? null;
  const mutations = useGrilleMutations();

  const { jours, creneaux, salles, profs, typesSeance, isLoading: chargeRef } = useReferentielsEDT();
  const { data: sousGroupes = [] } = useSousGroupes(classeId);

  // Semaines de la période : c'est ce qui peuple le sélecteur.
  const { data: semestres = [] } = useSemestresAll({ annee_universitaire: annee });
  const semestre = useMemo(
    () => semestres.find(s => classe && s.niveau === classe.niveau
                              && s.type_semestre === typeSemestre),
    [classe, semestres, typeSemestre],
  );
  const { data: semaines = [] } = useSemaines(semestre?.id ?? null);
  const semainesCours = useMemo(
    () => semaines.filter(s => s.type_semaine === 'cours'),
    [semaines],
  );
  const enModeSemaine = periodeId !== null;
  const semaine = semainesCours.find(s => s.id === periodeId);

  const { data: donneesSemaine, isLoading: chargeSemaine } =
    useEdtSemaine(enModeSemaine ? classeId : null, periodeId);
  // Le repli `?? []` doit être mémoïsé : écrit en valeur par défaut de
  // déstructuration, il fabriquait un tableau neuf à chaque rendu, relançant
  // l'effet de chargement, qui reposait `cases`, qui provoquait un rendu…
  // jusqu'à « Maximum update depth exceeded ».
  const seancesSemaine = useMemo(() => donneesSemaine ?? [], [donneesSemaine]);

  // Les matières proposées sont celles du semestre visé : en proposer d'un autre
  // semestre produirait une grille incohérente avec la maquette.
  const codesSemestre = useMemo(() => {
    if (!classe) return [] as string[];
    return classe.niveau === 'MPSI'
      ? (typeSemestre === 'I' ? ['S1'] : ['S2'])
      : (typeSemestre === 'I' ? ['S3'] : ['S4']);
  }, [classe, typeSemestre]);
  const { data: toutesMatieres = [] } = useMatieresSelect({ actif: true });
  const matieres = toutesMatieres.filter(m => codesSemestre.includes(m.code_semestre));

  // ── État d'édition ────────────────────────────────────────────────────────
  const [cases, setCases] = useState<Record<string, Emplacement>>({});
  const originaux = useRef<Record<string, Emplacement>>({});
  /**
   * Plan en cours d'édition : `''` = classe entière, sinon l'identifiant d'un
   * sous-groupe.
   *
   * La grille n'affiche qu'un plan à la fois. Empiler les sous-groupes dans la
   * case obligeait à y loger quatre autocomplétions par groupe — douze champs
   * par case pour deux groupes — et la grille devenait illisible avant même
   * d'être remplie.
   */
  const [vue, setVue] = useState<string>('');
  const [seanceEditee, setSeanceEditee]   = useState<SeanceReelle | null>(null);
  const [seanceAppel, setSeanceAppel]     = useState<SeanceReelle | null>(null);
  const [permutation, setPermutation]     = useState<SeanceReelle | null>(null);
  const [duplicationOuverte, setDuplicationOuverte] = useState(false);
  const [toast, setToast]   = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const notifier = (m: string) => { setToast(m); setTimeout(() => setToast(null), 3500); };

  // `originaux` fige l'état serveur : c'est lui qui permet, à l'enregistrement,
  // de distinguer un ajout d'une modification et d'une suppression.
  useEffect(() => {
    // En mode semaine, la source est la séance RÉELLE : c'est elle qui porte
    // l'annulation, la permutation et les absences.
    const source = enModeSemaine
      ? seancesSemaine.map(s => ({
          jour: s.jour, creneau: s.creneau, sous_groupe: s.sous_groupe,
          matiere: s.matiere, prof: s.prof, salle: s.salle,
          type_seance: s.type_seance, id: s.id, annulee: s.annulee,
        }))
      : (grille?.seances ?? []).map(s => ({
          jour: s.jour, creneau: s.creneau, sous_groupe: s.sous_groupe,
          matiere: s.matiere, prof: s.prof, salle: s.salle,
          type_seance: s.type_seance, id: s.id, annulee: false,
        }));

    if (!enModeSemaine && !grille) { setCases({}); originaux.current = {}; return; }

    const etat: Record<string, Emplacement> = {};
    for (const s of source) {
      etat[cle(s.jour, s.creneau, s.sous_groupe ? String(s.sous_groupe) : '')] = {
        matiereId:  String(s.matiere),
        profId:     s.prof  ? String(s.prof)  : '',
        salleId:    s.salle ? String(s.salle) : '',
        typeSeance: String(s.type_seance),
        idOrigine:  s.id,
        annulee:    s.annulee,
      };
    }
    setCases(etat);
    originaux.current = JSON.parse(JSON.stringify(etat));
  }, [grille, enModeSemaine, seancesSemaine]);

  const majCase = (k: string, champ: keyof Emplacement, valeur: string) =>
    setCases(prev => ({ ...prev, [k]: { ...(prev[k] ?? VIDE), [champ]: valeur } }));

  /**
   * Vider la matière retire la séance : c'est elle qui matérialise la case.
   *
   * Si la case n'a jamais été enregistrée, on retire carrément la clé plutôt
   * que d'y laisser une coquille vide — sans quoi, dans le plan d'un
   * sous-groupe, la case resterait « propre au groupe » et cesserait de
   * reprendre l'emploi du temps de la classe.
   */
  const viderCase = (k: string) =>
    setCases(prev => {
      const courant = prev[k];
      if (!courant) return prev;
      if (!courant.idOrigine) {
        const copie = { ...prev };
        delete copie[k];
        return copie;
      }
      // Le type fait partie de la case : l'oublier laissait « TP » affiché sur
      // une case qu'on venait de vider, comme un résidu de la séance retirée.
      return {
        ...prev,
        [k]: { ...courant, matiereId: '', profId: '', salleId: '', typeSeance: '' },
      };
    });

  /** Date réelle d'une case : lundi de la semaine + rang du jour. */
  const dateDeLaCase = (jourId: number): string | undefined => {
    if (!semaine) return undefined;
    const rang = jours.findIndex(j => j.id === jourId);
    if (rang < 0) return undefined;
    const d = new Date(semaine.date_debut);
    d.setDate(d.getDate() + rang);
    return d.toISOString().slice(0, 10);
  };

  // ── Enregistrement par lot ────────────────────────────────────────────────
  const enregistrer = useMutation({
    mutationFn: async () => {
      if (!enModeSemaine && !grilleId) throw new Error('Aucune grille sélectionnée.');

      // Le type de séance n'a plus de valeur présumée : une case renseignée
      // sans type serait enregistrée en « Cours » à l'insu de l'utilisateur, et
      // fausserait aussi bien l'avancement que le taux de vacation appliqué.
      const sansType = Object.values(cases).filter(c => c.matiereId && !c.typeSeance).length;
      if (sansType) {
        throw new Error(
          `${sansType} case${sansType > 1 ? 's' : ''} sans type de séance. `
          + 'Renseignez-le (Cours, TD, TP…) avant d\'enregistrer.',
        );
      }

      let crees = 0, modifies = 0, supprimes = 0, erreurs = 0;

      // ── Mode semaine : on écrit des séances RÉELLES ──────────────────────
      if (enModeSemaine) {
        const toutes = new Set([...Object.keys(cases), ...Object.keys(originaux.current)]);
        for (const k of toutes) {
          const courant = cases[k];
          const origine = originaux.current[k];
          const [jour, creneau, sousGroupe] = k.split('__');

          const remplie  = !!courant?.matiereId;
          const existait = !!origine?.idOrigine;
          if (!remplie && !existait) continue;

          try {
            if (remplie && !existait) {
              await seancesApi.create({
                classe:      classeId as number,
                semaine:     periodeId as number,
                jour:        Number(jour),
                creneau:     Number(creneau),
                matiere:     Number(courant.matiereId),
                prof:        courant.profId  ? Number(courant.profId)  : null,
                salle:       courant.salleId ? Number(courant.salleId) : null,
                sous_groupe: sousGroupe ? Number(sousGroupe) : null,
                type_seance: Number(courant.typeSeance),
                date:        dateDeLaCase(Number(jour)),
              } as Partial<SeanceReelle>);
              crees++;
            } else if (remplie && existait) {
              const change =
                courant.matiereId  !== origine.matiereId ||
                courant.profId     !== origine.profId    ||
                courant.salleId    !== origine.salleId   ||
                courant.typeSeance !== origine.typeSeance;
              if (change) {
                await seancesApi.update(origine.idOrigine as number, {
                  matiere:     Number(courant.matiereId),
                  prof:        courant.profId  ? Number(courant.profId)  : null,
                  salle:       courant.salleId ? Number(courant.salleId) : null,
                  type_seance: Number(courant.typeSeance),
                } as Partial<SeanceReelle>);
                modifies++;
              }
            } else {
              await seancesApi.remove(origine.idOrigine as number);
              supprimes++;
            }
          } catch { erreurs++; }
        }
        return { crees, modifies, supprimes, erreurs };
      }

      const toutes = new Set([...Object.keys(cases), ...Object.keys(originaux.current)]);
      for (const k of toutes) {
        const courant = cases[k];
        const origine = originaux.current[k];
        const [jour, creneau, sousGroupe] = k.split('__');

        const remplie  = !!courant?.matiereId;
        const existait = !!origine?.idOrigine;
        if (!remplie && !existait) continue;

        const corps = {
          // Non nul : la garde d'entrée l'exige hors mode semaine, et ce
          // chemin n'est atteint que dans ce cas.
          grille:      grilleId as number,
          jour:        Number(jour),
          creneau:     Number(creneau),
          matiere:     courant?.matiereId ? Number(courant.matiereId) : undefined,
          prof:        courant?.profId  ? Number(courant.profId)  : null,
          salle:       courant?.salleId ? Number(courant.salleId) : null,
          sous_groupe: sousGroupe ? Number(sousGroupe) : null,
          // Non vide : les cases sans type ont été refusées plus haut. Sur une
          // suppression, `courant` peut manquer — la valeur n'est alors pas lue.
          type_seance: courant?.typeSeance ? Number(courant.typeSeance) : undefined,
        };

        try {
          if (remplie && !existait) {
            await seancesTypeApi.create(corps);
            crees++;
          } else if (remplie && existait) {
            const change =
              courant.matiereId  !== origine.matiereId ||
              courant.profId     !== origine.profId    ||
              courant.salleId    !== origine.salleId   ||
              courant.typeSeance !== origine.typeSeance;
            if (change) {
              await seancesTypeApi.update(origine.idOrigine as number, corps);
              modifies++;
            }
          } else {
            await seancesTypeApi.remove(origine.idOrigine as number);
            supprimes++;
          }
        } catch { erreurs++; }
      }
      return { crees, modifies, supprimes, erreurs };
    },
    onSuccess: ({ crees, modifies, supprimes, erreurs }) => {
      const parts: string[] = [];
      if (crees)     parts.push(`${crees} ajoutée${crees > 1 ? 's' : ''}`);
      if (modifies)  parts.push(`${modifies} modifiée${modifies > 1 ? 's' : ''}`);
      if (supprimes) parts.push(`${supprimes} supprimée${supprimes > 1 ? 's' : ''}`);
      if (erreurs)   parts.push(`${erreurs} erreur${erreurs > 1 ? 's' : ''}`);
      if (!parts.length) parts.push('Aucune modification');
      notifier(parts.join(' · '));
      qc.invalidateQueries({ queryKey: ipgeiKeys.grilles.all });
      // ET les séances réelles : en mode semaine, n'invalider que la grille
      // laissait `cases` avec des `idOrigine` nuls. La case restait vue comme
      // « à créer », le bouton restait actif, et chaque nouveau clic créait un
      // doublon — trois enregistrements donnaient trois séances identiques.
      qc.invalidateQueries({ queryKey: [...ipgeiKeys.all, 'edt'] });
    },
    onError: (e) => setErreur(e instanceof Error ? e.message : 'Erreur'),
  });

  // ── Options d'autocomplétion ──────────────────────────────────────────────
  const optProfs:    OptionAC[] = profs.map(p => ({ id: String(p.id), label: `${p.nom} (${p.type})` }));
  const optSalles:   OptionAC[] = salles.map(s => ({ id: String(s.id), label: s.nom }));
  const optMatieres: OptionAC[] = matieres.map(m => ({ id: String(m.id), label: `${m.code} — ${m.intitule}` }));
  // Options prises du référentiel du socle, plus d'une liste figée.
  const optTypes:    OptionAC[] = typesSeance.map(t => ({ id: String(t.id), label: t.type_seance }));
  /** Un type spécial (sport, instruction militaire) n'a ni enseignant ni salle. */
  const estSpecial = (id: string) => !!typesSeance.find(t => String(t.id) === id)?.is_special;

  /**
   * Un enseignant ou une salle déjà pris sur ce créneau n'est plus proposé
   * ailleurs — même garde-fou contre le double-booking que la grille SIGA.
   */
  const occupes = (jour: number, creneau: number, kCourant: string) => {
    const pro = new Set<string>(), sal = new Set<string>();
    for (const [k, v] of Object.entries(cases)) {
      if (k === kCourant || !v.matiereId) continue;
      // Le conflit se juge sur la case horaire complète, jour compris : un
      // enseignant peut évidemment assurer le créneau de 09h45 le lundi ET le
      // mardi. Ne comparer que le créneau le rendait indisponible toute la
      // semaine dès qu'il était placé une fois.
      const [kJour, kCreneau] = k.split('__');
      if (Number(kJour) !== jour || Number(kCreneau) !== creneau) continue;
      if (v.profId)  pro.add(v.profId);
      if (v.salleId) sal.add(v.salleId);
    }
    return { pro, sal };
  };

  const modifie   = JSON.stringify(cases) !== JSON.stringify(originaux.current);
  const nbSeances = Object.values(cases).filter(c => c.matiereId).length;

  // Compte du plan affiche, distinct du total : sans lui on ne saurait pas si
  // une grille vide l'est vraiment ou si l'on regarde simplement un autre plan.
  const nbSeancesVue = Object.entries(cases)
    .filter(([k, v]) => v.matiereId && k.split('__')[2] === vue).length;
  const nomVue = vue
    ? (sousGroupes.find(sg => String(sg.id) === vue)?.libelle ?? 'Sous-groupe')
    : 'Classe entière';

  const boutonEnregistrer = (
    <button onClick={() => enregistrer.mutate()} disabled={!modifie || enregistrer.isPending}
            className={BTN_PRIMAIRE} style={{ background: DEGRADE }}>
      {enregistrer.isPending
        ? <><Loader2 size={14} className="animate-spin" /> Enregistrement…</>
        : <><Save size={14} /> Enregistrer</>}
    </button>
  );

  return (
    <div className="space-y-4">
      <EnTetePage
        icone={<CalendarRange size={14} className="text-white" />}
        titre="Gérer les emplois"
        sousTitre="Grille type de la classe — dupliquée ensuite sur chaque semaine du semestre."
        actions={grilleId ? (
          <>
            {/* Toujours disponible, quelle que soit la période affichée : la
                masquer en mode semaine se lisait comme une disparition
                inexpliquée. Elle agit sur le patron — le rappel est dans la
                modale. */}
            <button onClick={() => setDuplicationOuverte(true)} className={BTN_SECONDAIRE}>
              <CopyPlus size={14} /> Dupliquer sur le semestre
            </button>
            {boutonEnregistrer}
          </>
        ) : undefined}
      />

      <div className={`${CARTE} p-4`}>
        {/* Alignée à gauche : la lecture commence par la classe, et les champs
            gardent la même origine que ceux du reste de l'application. */}
        <div className="flex items-end gap-3 flex-wrap">
          <div style={{ minWidth: 220 }}>
            <label className="block text-xs font-semibold text-iss-dark mb-1.5">Classe</label>
            <select value={classeId ?? ''} className={SELECT}
                    onChange={e => {
                      setClasseId(e.target.value ? Number(e.target.value) : null);
                      setVue('');           // la vue d'une classe n'a pas de sens sur une autre
                      // La semaine non plus : chaque niveau a ses propres
                      // semaines. Garder l'identifiant de l'ancienne faisait
                      // interroger la nouvelle classe sur une semaine qui ne
                      // lui appartient pas — grille vide, et bandeau décrivant
                      // une semaine qu'on ne regarde pas.
                      setPeriodeId(null);
                    }}>
              <option value="">— Classe —</option>
              {classes.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
            </select>
          </div>

          {/* Sélecteur de période : le patron, ou une semaine réelle. En
              navigation fléchée plutôt qu'en boutons — seize semaines ne
              tiennent pas sur une ligne. */}
          <div>
            <label className="block text-xs font-semibold text-iss-dark mb-1.5">Période</label>
            <div className="flex items-center gap-1">
              <button onClick={() => {
                        const i = semainesCours.findIndex(s => s.id === periodeId);
                        setPeriodeId(i <= 0 ? null : semainesCours[i - 1].id);
                      }}
                      disabled={periodeId === null}
                      title="Période précédente"
                      className="p-2.5 rounded-xl border border-gray-200 text-iss-gray hover:bg-gray-50 disabled:opacity-40 transition-colors">
                <ChevronLeft size={14} />
              </button>
              <select value={periodeId ?? ''} className={SELECT} style={{ minWidth: 190 }}
                      onChange={e => setPeriodeId(e.target.value ? Number(e.target.value) : null)}>
                <option value="">Grille type (toutes semaines)</option>
                {semainesCours.map(s => (
                  <option key={s.id} value={s.id}>
                    Semaine {s.numero} · {new Date(s.date_debut).toLocaleDateString('fr-FR')}
                  </option>
                ))}
              </select>
              <button onClick={() => {
                        const i = semainesCours.findIndex(s => s.id === periodeId);
                        if (i < semainesCours.length - 1) setPeriodeId(semainesCours[i + 1].id);
                      }}
                      disabled={semainesCours.length === 0
                                || periodeId === semainesCours[semainesCours.length - 1]?.id}
                      title="Période suivante"
                      className="p-2.5 rounded-xl border border-gray-200 text-iss-gray hover:bg-gray-50 disabled:opacity-40 transition-colors">
                <ChevronRight size={14} />
              </button>
            </div>
          </div>

          {/* Sélecteur de plan. Absent quand la classe n'a pas de sous-groupe :
              il n'y aurait qu'un seul choix. */}
          {sousGroupes.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-iss-dark mb-1.5">Plan</label>
              <div className="inline-flex rounded-xl border border-gray-200 overflow-hidden">
                {[{ id: '', libelle: 'Classe entière' },
                  ...sousGroupes.map(sg => ({ id: String(sg.id), libelle: sg.libelle }))
                ].map((p, i) => (
                  <button
                    key={p.id || 'classe'}
                    onClick={() => setVue(p.id)}
                    title={p.id
                      ? `Éditer l'emploi du temps du sous-groupe ${p.libelle}`
                      : "Éditer les séances suivies par la classe entière"}
                    className="text-sm font-semibold transition-colors"
                    style={{
                      padding: '9px 14px',
                      borderLeft: i > 0 ? '1px solid #e5e7eb' : undefined,
                      background: vue === p.id ? VERT : 'white',
                      color:      vue === p.id ? 'white' : '#6b7280',
                    }}
                  >
                    {p.libelle}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Contexte de session : le semestre concret (S1…S4) suffit. L'année
              est déjà affichée en haut de l'application, et « Semestres impairs »
              disait deux fois la même chose que le code qui le suivait.

              Présenté comme les autres champs — étiquette au-dessus, même
              hauteur — plutôt qu'en pastille flottante : il appartient à la
              même barre, il doit s'y aligner. */}
          {classe && (
            <div>
              <label className="block text-xs font-semibold text-iss-dark mb-1.5">Semestre</label>
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50">
                <span className="w-2 h-2 rounded-full" style={{ background: VERT }} />
                <span className="text-sm font-semibold text-iss-dark">
                  {classe.niveau === 'MP'
                    ? (typeSemestre === 'I' ? 'S3' : 'S4')
                    : (typeSemestre === 'I' ? 'S1' : 'S2')}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {erreur && <Erreur erreur={new Error(erreur)} />}

      {/* C'est ici qu'on provoque la divergence — et ici qu'on la corrige. */}
      {enModeSemaine && <BandeauCoherence semaine={semaine} />}

      {!classeId ? (
        <div className={CARTE}>
          <Vide texte="Sélectionnez une classe : sa grille s'ouvre aussitôt." />
        </div>
      ) : chargeRef || (enModeSemaine ? chargeSemaine : (isLoading && !grille)) ? (
        <div className={CARTE}>
          <Chargement texte={enModeSemaine ? 'Ouverture de la semaine…' : 'Ouverture de la grille…'} />
        </div>
      ) : !enModeSemaine && !grilleId ? (
        <div className={CARTE}><Erreur erreur={erreurGrille ?? new Error('Grille indisponible.')} /></div>
      ) : (
        <>
          <div className={`${CARTE} px-4 py-3 flex items-center gap-3 flex-wrap`}
               style={{ borderLeft: `3px solid ${enModeSemaine ? '#7c3aed' : '#006633'}` }}>
            <span className="text-sm font-bold text-iss-dark">
              {classe?.nom}{sousGroupes.length > 0 && ` · ${nomVue}`}
            </span>
            {/* Ce qu'on édite doit rester lisible d'un coup d'oeil : modifier
                le patron ou une seule semaine n'a pas les mêmes conséquences. */}
            <Badge ton={enModeSemaine ? 'violet' : 'vert'}>
              {enModeSemaine
                ? `Semaine ${semaine?.numero} — cette semaine seulement`
                : 'Grille type — toutes les semaines à venir'}
            </Badge>
            <Badge ton="neutre">
              {nbSeancesVue} séance{nbSeancesVue !== 1 ? 's' : ''}
              {vue ? ' propre à ce groupe' : ''}
            </Badge>
            {vue && (
              <span className="text-xs text-iss-gray">
                les autres cases reprennent l&apos;emploi du temps de la classe
              </span>
            )}
            {sousGroupes.length > 0 && !vue && nbSeances !== nbSeancesVue && (
              <Badge ton="neutre">{nbSeances} au total, tous plans confondus</Badge>
            )}
            {modifie && <Badge ton="ambre">Modifications non enregistrées</Badge>}
            {matieres.length === 0 && (
              <Badge ton="rouge">Aucune matière active en {codesSemestre.join(' / ')}</Badge>
            )}
            <p className="text-xs text-iss-gray ml-auto">
              La matière matérialise la séance : la renseigner programme la case, la vider la retire.
            </p>
          </div>

          <div className={`${CARTE} overflow-hidden`}>
            <div style={{ overflowX: 'auto' }}>
              <table style={STYLE_TABLE}>
                <thead>
                  <tr style={STYLE_ENTETE_LIGNE}>
                    <th style={STYLE_ENTETE_JOUR}>Jour</th>
                    {creneaux.map(c => (
                      <th key={c.id} style={STYLE_ENTETE_CRENEAU}>{c.creneau}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {jours.map((j, ligne) => (
                    <tr key={j.id} style={{ background: ligne % 2 === 0 ? 'white' : '#fafafa' }}>
                      <td style={STYLE_CELLULE_JOUR}>{j.jour}</td>
                      {creneaux.map(c => {
                        const k = cle(j.id, c.id, vue);

                        // Dans le plan d'un sous-groupe, la case reprend
                        // l'emploi du temps de la classe : un étudiant de G1
                        // suit tous les cours en classe entière, seuls les TP
                        // sont dédoublés. Les champs sont donc pré-remplis
                        // comme ceux de la classe — il n'y a que ce qui diffère
                        // à saisir.
                        //
                        // Tant qu'on n'y touche pas, RIEN n'est enregistré : la
                        // séance reste celle de la classe, et n'existe qu'une
                        // fois en base. La recopier produirait deux lignes pour
                        // un même cours, donc des heures comptées deux fois au
                        // Suivi, à l'Avancement et sur les vacations.
                        // Dès qu'une case porte une saisie, elle prime : la
                        // tester sur sa seule matière ferait disparaître un
                        // professeur choisi avant elle, puisque l'ordre des
                        // champs met le professeur en premier.
                        const propre  = cases[k];
                        const herite  = vue ? cases[cle(j.id, c.id, '')] : undefined;
                        const estHerite = !propre && !!herite?.matiereId;
                        const cellule = propre ?? (estHerite && herite
                          ? { ...herite, idOrigine: null }
                          : VIDE);

                        // Depuis le plan « Classe entière », les séances des
                        // sous-groupes étaient invisibles : on pouvait poser un
                        // cours sur un créneau déjà occupé par un TP dédoublé
                        // sans rien voir, ce qui produit une case impossible —
                        // toute la classe en cours pendant qu'un groupe est
                        // ailleurs.
                        const groupesOccupant = vue ? [] : sousGroupes.filter(sg => {
                          const bloc = cases[cle(j.id, c.id, String(sg.id))];
                          return !!bloc?.matiereId;
                        });

                        const { pro, sal } = occupes(j.id, c.id, k);

                        // La case prend la couleur de son type — bleu pour un
                        // cours, vert pour un TD, orange pour un TP, violet
                        // pour un DS. C'est ce qui remplace la pastille : la
                        // grille se lit d'un coup d'oeil, sans rien répéter.
                        const libelleType = typesSeance.find(
                          t => String(t.id) === cellule.typeSeance)?.type_seance;
                        const coul = couleurType(libelleType);
                        const speciale = estSpecial(cellule.typeSeance);
                        const occupee = !!cellule.matiereId;

                        return (
                          <td key={c.id} style={{
                            ...STYLE_CELLULE,
                            background: occupee ? coul.bg : undefined,
                            // Un liseré plus franc sur le bord gauche donne au
                            // type une lisibilité que le fond, très pâle pour
                            // rester derrière les champs, ne suffit pas à porter.
                            borderLeft: occupee ? `3px solid ${coul.border}` : STYLE_CELLULE.border,
                          }}>
                            {groupesOccupant.length > 0 && (
                              <div title={'Ce créneau est occupé par des enseignements en '
                                        + 'sous-groupe. La classe entière ne peut pas y avoir cours.'}
                                   style={{
                                     marginBottom: 5, padding: '3px 5px', borderRadius: 6,
                                     background: 'rgba(255,152,0,0.10)',
                                     border: '1px solid #FF9800',
                                     fontSize: 9, lineHeight: 1.35, color: '#EF6C00',
                                   }}>
                                <div className="flex items-center gap-1">
                                  <Lock size={8} style={{ flexShrink: 0 }} />
                                  <span style={{ fontWeight: 700 }}>
                                    Occupé par {groupesOccupant.map(sg => sg.libelle).join(', ')}
                                  </span>
                                </div>
                                <span>Créneau dédoublé — pas de cours en classe entière.</span>
                              </div>
                            )}

                            <div style={{
                              position: 'relative',
                              opacity: estHerite ? 0.62 : 1,
                              // La case reste consultable, mais on décourage la
                              // saisie là où elle produirait une incohérence.
                              display: groupesOccupant.length > 0 && !cellule.matiereId
                                ? 'none' : undefined,
                            }}>
                              {/* Pas de pastille de type ici : le champ « Type
                                  séance » est juste en dessous et dit la même
                                  chose. Elle reste sur les écrans de
                                  consultation, où aucun champ ne l'affiche. */}

                              {estHerite && (
                                <div title={'Créneau réservé par la classe entière. Ce groupe y '
                                          + 'suit le cours commun : la case se modifie dans le '
                                          + 'plan « Classe entière ».'}
                                     className="flex items-center gap-1"
                                     style={{ fontSize: 9, color: '#9ca3af', marginBottom: 2 }}>
                                  <Lock size={8} style={{ flexShrink: 0 }} />
                                  Réservé par la classe — lecture seule
                                </div>
                              )}

                              {/* Case reprise de la classe : lecture seule.
                                  Le groupe suit sa classe, il ne peut pas avoir
                                  autre chose au même moment — la modifier
                                  créerait la case impossible que le serveur
                                  refuse désormais. Les valeurs restent
                                  affichées : on doit voir ce que le groupe fait
                                  à cette heure-là. */}
                              {/* Une séance spéciale — sport, instruction
                                  militaire — n'a ni enseignant ni salle : le
                                  créneau est bloqué pour la classe, mais
                                  personne du référentiel ne l'assure. Proposer
                                  ces champs inviterait à compter des heures,
                                  donc une vacation, pour un cours non donné. */}
                              {!speciale && (
                                <AC value={cellule.profId} placeholder="Professeur"
                                    disabled={estHerite}
                                    options={optProfs.filter(p => !pro.has(p.id) || p.id === cellule.profId)}
                                    onChange={v => majCase(k, 'profId', v)} />
                              )}
                              <AC value={cellule.matiereId} options={optMatieres} placeholder="Matière"
                                  disabled={estHerite}
                                  onChange={v => majCase(k, 'matiereId', v)} />
                              <AC value={cellule.typeSeance} options={optTypes} placeholder="Type séance"
                                  disabled={estHerite}
                                  onChange={v => majCase(k, 'typeSeance', v)} />
                              {!speciale && (
                                <AC value={cellule.salleId} placeholder="Salle"
                                    disabled={estHerite}
                                    options={optSalles.filter(s => !sal.has(s.id) || s.id === cellule.salleId)}
                                    onChange={v => majCase(k, 'salleId', v)} />
                              )}

                              {/* Gestes propres à une séance datée. Ils n'ont
                                  pas d'objet sur le patron : on n'annule ni ne
                                  permute un modèle, et on ne fait pas l'appel
                                  sur une case théorique. */}
                              {enModeSemaine && cellule.idOrigine && (
                                <div className="flex items-center gap-1.5 mt-0.5">
                                  {(() => {
                                    const reelle = seancesSemaine.find(s => s.id === cellule.idOrigine);
                                    if (!reelle) return null;
                                    return (
                                      <>
                                        <button onClick={() => setSeanceEditee(reelle)}
                                                title="Annuler la séance ou reporter sur N semaines"
                                                className="text-iss-gray hover:text-red-600 transition-colors">
                                          <Ban size={11} />
                                        </button>
                                        <button onClick={() => setPermutation(reelle)}
                                                title="Permuter les enseignants"
                                                className="text-iss-gray hover:text-[#7c3aed] transition-colors">
                                          <Repeat size={11} />
                                        </button>
                                        <button onClick={() => setSeanceAppel(reelle)}
                                                title="Feuille d'appel"
                                                className="text-iss-gray hover:text-[#006633] transition-colors">
                                          <UserX size={11} />
                                        </button>
                                        {cellule.annulee && (
                                          <span style={{ fontSize: 9, fontWeight: 700, color: '#b91c1c' }}>
                                            ANNULÉE
                                          </span>
                                        )}
                                      </>
                                    );
                                  })()}
                                </div>
                              )}

                              {cellule.matiereId && !estHerite && (
                                <button onClick={() => viderCase(k)}
                                        title={vue
                                          ? "Retirer cette séance : le sous-groupe reprendra celle de la classe"
                                          : "Vider la case"}
                                        className="flex items-center gap-1 text-iss-gray hover:text-red-600 transition-colors"
                                        style={{ fontSize: 9 }}>
                                  <Trash2 size={9} /> {vue ? 'Reprendre la classe' : 'Vider'}
                                </button>
                              )}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pas de légende des types : chaque case porte déjà sa pastille
                nommée (Cours, TD, TP, DS). La rappeler en bas de grille
                n'apprenait rien et repoussait le bouton d'enregistrement. */}
            <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-end">
              {boutonEnregistrer}
            </div>
          </div>
        </>
      )}

      {duplicationOuverte && grilleId && (
        <ModaleDuplication
          grilleId={grilleId}
          annee={annee}
          niveau={classe?.niveau ?? 'MPSI'}
          typeSemestre={typeSemestre}
          onFerme={() => setDuplicationOuverte(false)}
          onFait={(m) => { setDuplicationOuverte(false); notifier(m); }}
          mutations={mutations}
        />
      )}

      {seanceEditee && (
        <ModaleEditionSeance
          seance={seanceEditee} profs={profs} salles={salles}
          onFerme={() => setSeanceEditee(null)}
          onFait={(m) => { setSeanceEditee(null); notifier(m); }}
        />
      )}
      {seanceAppel && (
        <ModaleAppel
          seance={seanceAppel}
          onFerme={() => setSeanceAppel(null)}
          onFait={(m) => { setSeanceAppel(null); notifier(m); }}
        />
      )}
      {permutation && (
        <ModalePermutation
          seance={permutation}
          candidates={seancesSemaine.filter(
            s => s.creneau === permutation.creneau && s.id !== permutation.id)}
          onFerme={() => setPermutation(null)}
          onFait={(m) => { setPermutation(null); notifier(m); }}
        />
      )}

      {toast && (
        <div className="fixed top-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold text-white shadow-xl"
             style={{ background: DEGRADE }}>
          <CheckCircle size={15} /> {toast}
        </div>
      )}
    </div>
  );
}

// ── Duplication sur le semestre ──────────────────────────────────────────────
type Mutations = ReturnType<typeof useGrilleMutations>;

function ModaleDuplication({
  grilleId, annee, niveau, typeSemestre, onFerme, onFait, mutations,
}: {
  grilleId: number; annee: string; niveau: 'MPSI' | 'MP'; typeSemestre: TypeSemestre;
  onFerme: () => void; onFait: (message: string) => void; mutations: Mutations;
}) {
  const { data: semestres = [] } = useSemestresAll({ annee_universitaire: annee });
  const candidats = semestres.filter(s => s.niveau === niveau && s.type_semestre === typeSemestre);

  const [semestre, setSemestre] = useState<number | null>(candidats[0]?.id ?? null);
  const [portee, setPortee]     = useState<'tout' | 'lot'>('tout');
  const [semaineDebut, setSemaineDebut] = useState<number | null>(null);
  const [nbSemaines, setNbSemaines]     = useState('4');
  const [ecraser, setEcraser] = useState(false);
  const [erreur, setErreur]   = useState<string | null>(null);

  const { data: semaines = [] } = useSemaines(semestre);
  const semainesCours = semaines.filter(s => s.type_semaine === 'cours');

  // On dépend de l'identifiant, pas du tableau : `candidats` naît d'un
  // `.filter()` et change d'identité à chaque rendu, ce qui relancerait
  // l'effet en boucle.
  const premierCandidat = candidats[0]?.id ?? null;
  useEffect(() => {
    if (!semestre && premierCandidat) setSemestre(premierCandidat);
  }, [premierCandidat, semestre]);

  const lancer = () => {
    if (!semestre) { setErreur('Choisissez un semestre.'); return; }
    if (portee === 'lot' && !semaineDebut) { setErreur('Choisissez la semaine de départ.'); return; }
    setErreur(null);
    mutations.dupliquer.mutate(
      {
        id: grilleId,
        input: {
          semestre,
          semaine_debut: portee === 'lot' ? semaineDebut : null,
          nb_semaines:   portee === 'lot' ? Number(nbSemaines) || 1 : undefined,
          ecraser,
        },
      },
      {
        onSuccess: (r) => onFait(
          `${r.creees} séance(s) créée(s) sur ${r.semaines_traitees} semaine(s)` +
          (r.ignorees ? ` — ${r.ignorees} case(s) déjà occupée(s), laissée(s) intacte(s)` : ''),
        ),
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
            <h3 className="text-sm font-bold text-iss-dark">Dupliquer la grille</h3>
            <p className="text-xs text-iss-gray">
              Déploie la <strong>grille type</strong> sur chaque semaine de cours,
              et non la semaine affichée à l&apos;écran.
            </p>
          </div>
          <button onClick={onFerme} className="p-1 rounded-lg text-iss-gray hover:bg-gray-100 transition-colors">
            <X size={14} />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-iss-dark mb-1.5">Semestre</label>
            <select value={semestre ?? ''} className={SELECT}
                    onChange={e => setSemestre(e.target.value ? Number(e.target.value) : null)}>
              <option value="">Choisir…</option>
              {candidats.map(s => (
                <option key={s.id} value={s.id}>
                  {s.code} — {s.nb_semaines_generees} semaine(s) générée(s)
                </option>
              ))}
            </select>
            {candidats.length === 0 && (
              <p className="text-xs text-amber-700 mt-1">
                Aucun semestre {typeSemestre === 'I' ? 'impair' : 'pair'} pour {niveau} en {annee}.
                Créez-le dans Paramètres.
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-iss-dark mb-1.5">Portée</label>
            <div className="flex gap-2">
              <button onClick={() => setPortee('tout')}
                      className={`flex-1 px-3 py-2 rounded-xl border text-sm font-semibold transition-all ${
                        portee === 'tout' ? 'bg-[#006633] text-white border-[#006633]'
                                          : 'bg-white text-iss-gray border-gray-200'}`}>
                Tout le semestre
              </button>
              <button onClick={() => setPortee('lot')}
                      className={`flex-1 px-3 py-2 rounded-xl border text-sm font-semibold transition-all ${
                        portee === 'lot' ? 'bg-[#006633] text-white border-[#006633]'
                                         : 'bg-white text-iss-gray border-gray-200'}`}>
                Un lot de N semaines
              </button>
            </div>
          </div>

          {portee === 'lot' && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold text-iss-dark mb-1.5">À partir de</label>
                <select value={semaineDebut ?? ''} className={SELECT}
                        onChange={e => setSemaineDebut(e.target.value ? Number(e.target.value) : null)}>
                  <option value="">Choisir…</option>
                  {semainesCours.map(s => (
                    <option key={s.id} value={s.id}>
                      S{s.numero} — {new Date(s.date_debut).toLocaleDateString('fr-FR')}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-iss-dark mb-1.5">Nombre de semaines</label>
                <input type="number" min={1} max={40} value={nbSemaines} className={INPUT}
                       onChange={e => setNbSemaines(e.target.value)} />
              </div>
            </div>
          )}

          <label className="flex items-start gap-2 text-sm text-iss-dark cursor-pointer">
            <input type="checkbox" checked={ecraser} onChange={e => setEcraser(e.target.checked)}
                   className="w-4 h-4 mt-0.5 accent-[#006633]" />
            <span>
              Écraser les séances issues de la grille
              <span className="block text-xs text-iss-gray">
                Sans cette option, une case déjà remplie est laissée telle quelle. Les séances
                ajoutées à la main ou issues d&apos;une permutation ne sont jamais écrasées.
              </span>
            </span>
          </label>
        </div>

        {erreur && <p className="mt-3 text-sm text-red-600">{erreur}</p>}

        <div className="flex gap-2 mt-5">
          <button onClick={lancer} disabled={mutations.dupliquer.isPending}
                  className={BTN_PRIMAIRE} style={{ background: DEGRADE }}>
            <CopyPlus size={14} /> {mutations.dupliquer.isPending ? 'Duplication…' : 'Dupliquer'}
          </button>
          <button onClick={onFerme} className={BTN_SECONDAIRE}>Annuler</button>
        </div>
      </div>
    </div>
  );
}
