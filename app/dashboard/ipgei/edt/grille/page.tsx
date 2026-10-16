'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle, ArrowDownToLine, CalendarRange, CheckCircle, ChevronLeft,
  ChevronRight, CopyPlus, Loader2, Lock, Repeat, Save, Trash2, X,
} from 'lucide-react';

import {
  BTN_PRIMAIRE, BTN_SECONDAIRE, Badge, CARTE, Chargement, DEGRADE, EnTetePage,
  Erreur, INPUT, SELECT, VERT, Vide,
} from '../../_ui';
import { anneeParDefaut } from '../../_annee';
import {
  semestreCourantDeLaClasse, semestreDeLaSemaine, useSemainesDeLaClasse,
} from '../_semaines-classe';
import { useReferentielsEDT } from '../_referentiels';
import { semaineAProposer } from '../_semaines';
import {
  BandeauFeries, CaseFeriee, EnteteJourFerme, FOND_JOUR_FERME,
  STYLE_CELLULE, STYLE_CELLULE_JOUR, STYLE_ENTETE_CRENEAU, STYLE_ENTETE_JOUR,
  STYLE_ENTETE_LIGNE, STYLE_TABLE, couleurType,
} from '../_cellule';
import { AC, avecDispo, noterPris, type OptionAC } from '../_autocomplete';
import {
  ipgeiKeys, useClassesSelect, useEdtSemaine, useGrilleMutations,
  useOccupationCreneaux,
  useGrillePourClasse, useMatieresSelect, useSemaines, useSemestresAll,
  useSousGroupes,
} from '@/lib/api/ipgei-hooks';
import { seancesApi, seancesTypeApi } from '@/lib/api/ipgei';
import { messageLisible } from '@/lib/api';
import {
  type NiveauIPGEI, type ResultatDuplication, type SeanceReelle,
  type TypeSemestre,
} from '@/types/ipgei';
import {
  ModalePermutation,
} from '../_seance-modales';
import { BandeauCoherence, libelleSemaine } from '../_consultation';

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

/**
 * Bouton d'action dans une case de grille.
 *
 * `p-1.5` porte la cible à environ 26 px de côté autour d'une icône de 13 —
 * l'icône nue offrait 11 px, sous le seuil où l'on vise sans y penser. Le fond
 * au survol montre l'étendue réelle de la zone, ce qui manquait tout autant :
 * on ne savait pas où finissait un bouton et où commençait le suivant.
 */
const BOUTON_CASE =
  'p-1.5 rounded-lg text-iss-gray transition-colors flex items-center gap-1';

/** Les deux gestes qui rechargent la grille depuis le serveur. */
const MSG_CLASSE =
  'Changer de classe abandonnera les modifications non enregistrées.';
const MSG_PERIODE =
  'Changer de période abandonnera les modifications non enregistrées.';

export default function GrilleTypePage() {
  const qc = useQueryClient();

  // L'année vient de la session ouverte. La PÉRIODE, elle, se lit sur la
  // classe : c'est son calendrier qui dit où elle en est, et deux années
  // d'étude peuvent ne pas être au même point — les MP en S4 quand les MPSI
  // sont encore en S1.
  const annee = anneeParDefaut();

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
  /**
   * Une semaine a-t-elle déjà été proposée pour la classe affichée ?
   *
   * Sans ce garde-fou, revenir au patron serait aussitôt défait par la
   * proposition — on ne pourrait plus l'ouvrir du tout. On propose une fois
   * par classe, ensuite le choix est celui de l'utilisateur.
   */
  const classeProposee = useRef<number | null>(null);

  const { data: classes = [] } = useClassesSelect({ annee_universitaire: annee, actif: true });
  const classe = classes.find(c => c.id === classeId);

  const mutations = useGrilleMutations();

  const { jours, creneaux, salles, profs, typesSeance, isLoading: chargeRef } = useReferentielsEDT();
  const { data: sousGroupes = [] } = useSousGroupes(classeId);

  // Les semaines de la classe, ses deux semestres réunis et triés par date.
  // L'état affiché est celui de la CLASSE, pas celui de son niveau — MPSI B
  // sans emploi du temps n'hérite pas du verdict de MPSI A.
  const { semaines, semestres: semestresClasse } = useSemainesDeLaClasse(classe, annee);
  const semainesCours = useMemo(
    () => semaines.filter(s => s.type_semaine === 'cours'),
    [semaines],
  );
  // Ouvrir sur la semaine du jour plutôt que sur le patron : c'est l'emploi du
  // temps réel qu'on vient consulter, le patron ne se retouche qu'à la
  // préparation du semestre. Il reste à un choix du sélecteur.
  useEffect(() => {
    if (!classeId || semainesCours.length === 0) return;
    if (classeProposee.current === classeId) return;
    classeProposee.current = classeId;
    setPeriodeId(semaineAProposer(semainesCours)?.id ?? null);
  }, [classeId, semainesCours]);

  const enModeSemaine = periodeId !== null;
  const semaine = semainesCours.find(s => s.id === periodeId);

  // La période éditée : celle de la semaine ouverte, ou — sur le patron, qui
  // n'est rattaché à aucune semaine — celle où la classe en est aujourd'hui.
  const typeSemestre = ((
    semestreDeLaSemaine(semestresClasse, semaine)
    ?? semestreCourantDeLaClasse(semestresClasse, semaines)
  )?.type_semestre ?? 'I') as TypeSemestre;

  // Le patron dépend de cette période : une classe passée au S4 édite le
  // patron du S4, sans qu'on ait à le déclarer à la connexion.
  const { data: grille, isLoading, error: erreurGrille } =
    useGrillePourClasse(classeId, typeSemestre);
  const grilleId = grille?.id ?? null;
  // Les jours FERMÉS de la semaine éditée. Le patron n'a pas de dates, donc pas
  // de férié : la carte reste vide hors mode semaine.
  const joursFermes = useMemo(
    () => new Map((enModeSemaine ? semaine?.jours_feries ?? [] : []).map(f => [f.jour, f])),
    [enModeSemaine, semaine],
  );

  const { data: donneesSemaine, isLoading: chargeSemaine } =
    useEdtSemaine(enModeSemaine ? classeId : null, periodeId);

  // Ce que les autres classes retiennent déjà sur chaque créneau. La liste
  // locale ne voit que la classe affichée ; sans cet appel, un enseignant placé
  // en MPSI A restait proposé en MPSI B au même moment.
  // En mode semaine, c'est la semaine ouverte qui est lue — ses séances
  // réelles, celles que le serveur contrôle à l'enregistrement —, sur le
  // patron ce sont les autres patrons de la période.
  //
  // `isError` est lu : sans cette lecture, les listes proposent tout le monde,
  // et ne rien en dire laissait le refus tomber à l'enregistrement.
  const { data: occupation = [], isError: occupationIllisible } =
    useOccupationCreneaux(classeId, periodeId, typeSemestre);
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
  // Séance dont on veut permuter l'enseignant. Les échanges possibles se
  // choisissent dans la fenêtre : le serveur n'accepte que deux séances de la
  // même classe et du même créneau, la liste est donc connue d'avance et rien
  // ne justifie un aller-retour dans la grille.
  const [permutation, setPermutation] = useState<SeanceReelle | null>(null);
  const [duplicationOuverte, setDuplicationOuverte] = useState(false);
  const [reportOuvert, setReportOuvert] = useState(false);

  // Le serveur exige deux séances de la même classe ET du même créneau.
  const candidats = useMemo(
    () => (permutation
      ? seancesSemaine.filter(s => s.creneau === permutation.creneau
                                && s.id !== permutation.id)
      : []),
    [permutation, seancesSemaine],
  );
  const [toast, setToast]   = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  /**
   * Geste mis en attente parce qu'il ferait perdre des modifications.
   *
   * Changer de classe ou de semaine recharge la grille depuis le serveur :
   * tout ce qui n'est pas enregistré disparaît. Le badge le disait, personne
   * ne le lisait — il fallait le demander.
   */
  const [aConfirmer, setAConfirmer] = useState<{
    message: string; faire: () => void;
  } | null>(null);

  const notifier = (m: string) => { setToast(m); setTimeout(() => setToast(null), 3500); };

  // Même protection que les autres écrans de saisie de l'application.
  // `modifie` est calculé plus bas ; l'effet le relit à chaque rendu, ce qui
  // suffit — le navigateur n'appelle le gestionnaire qu'à la fermeture.
  const modifieRef = useRef(false);
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (modifieRef.current) {
        e.preventDefault();
        e.returnValue = 'Modifications non enregistrées. Quitter ?';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

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
      /** Une case spéciale n'a pas de matière : c'est son type qui la matérialise. */
      const remplieCase = (c: Emplacement) => !!c.matiereId || estSpecial(c.typeSeance);
      const sansType = Object.values(cases).filter(c => c.matiereId && !c.typeSeance).length;
      if (sansType) {
        throw new Error(
          `${sansType} case${sansType > 1 ? 's' : ''} sans type de séance. `
          + 'Renseignez-le (Cours, TD, TP…) avant d\'enregistrer.',
        );
      }

      let crees = 0, modifies = 0, supprimes = 0, erreurs = 0;
      /**
       * Les motifs des refus, sans doublon. « 1 erreur » seul ne disait ni
       * quelle case ni pourquoi — le serveur, lui, nomme l'enseignant et le
       * groupe qui le tient (« … sur ce créneau (MPSI B · B1) »).
       */
      const motifs: string[] = [];
      const refuse = (e: unknown) => {
        erreurs++;
        const m = messageLisible(e);
        if (m && !motifs.includes(m)) motifs.push(m);
      };

      // ── Mode semaine : on écrit des séances RÉELLES ──────────────────────
      if (enModeSemaine) {
        const toutes = new Set([...Object.keys(cases), ...Object.keys(originaux.current)]);
        for (const k of toutes) {
          const courant = cases[k];
          const origine = originaux.current[k];
          const [jour, creneau, sousGroupe] = k.split('__');
          // Un jour fermé ne s'écrit pas : le serveur refuserait, et ses cases
          // sont figées à l'écran. On le saute plutôt que de compter un échec.
          if (joursFermes.has(Number(jour))) continue;

          const remplie  = !!courant && remplieCase(courant);
          const existait = !!origine?.idOrigine;
          if (!remplie && !existait) continue;

          try {
            if (remplie && !existait) {
              await seancesApi.create({
                classe:      classeId as number,
                semaine:     periodeId as number,
                jour:        Number(jour),
                creneau:     Number(creneau),
                matiere:     courant.matiereId ? Number(courant.matiereId) : null,
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
                  matiere:     courant.matiereId ? Number(courant.matiereId) : null,
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
          } catch (e) { refuse(e); }
        }
        return { crees, modifies, supprimes, erreurs, motifs };
      }

      const toutes = new Set([...Object.keys(cases), ...Object.keys(originaux.current)]);
      for (const k of toutes) {
        const courant = cases[k];
        const origine = originaux.current[k];
        const [jour, creneau, sousGroupe] = k.split('__');

        const remplie  = !!courant && remplieCase(courant);
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
        } catch (e) { refuse(e); }
      }
      return { crees, modifies, supprimes, erreurs, motifs };
    },
    onSuccess: ({ crees, modifies, supprimes, erreurs, motifs }) => {
      // Le reste est enregistré ; ce qui a été refusé se lit, motif compris,
      // jusqu'au prochain enregistrement.
      setErreur(motifs.length
        ? `${motifs.length > 1 ? 'Refus du serveur' : 'Refusé par le serveur'} : ${motifs.join(' · ')}`
        : null);
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
      // ET le verdict de cohérence : il est calculé au serveur et porté par la
      // liste des semaines. Sans cela le bandeau annonçait « suivi à jour »
      // avec l'état d'avant l'enregistrement — au moment précis où il venait de
      // cesser d'être vrai.
      qc.invalidateQueries({ queryKey: [...ipgeiKeys.all, 'semaines'] });
    },
    onError: (e) => setErreur(e instanceof Error ? e.message : 'Erreur'),
  });

  // ── Options d'autocomplétion ──────────────────────────────────────────────
  const optProfs:    OptionAC[] = profs.map(p => ({ id: String(p.id), label: `${p.nom} (${p.type})` }));
  const optSalles:   OptionAC[] = salles.map(s => ({ id: String(s.id), label: s.nom }));
  const optMatieres: OptionAC[] = matieres.map(m => ({ id: String(m.id), label: `${m.code} — ${m.intitule}` }));
  // Options prises du référentiel du socle, plus d'une liste figée.
  // Le menu montre « Cours » là où le référentiel dit « CM ». Purement
  // cosmétique, et sans risque : l'option porte l'IDENTIFIANT du type, c'est
  // lui qui part au serveur. Le code, lui, reste la clé partout ailleurs —
  // couleur de la case, familles d'avancement, taux de paiement —, et le
  // renommer en base casserait ces correspondances en silence.
  const NOM_AFFICHE: Record<string, string> = { CM: 'Cours' };
  const optTypes:    OptionAC[] = typesSeance.map(
    t => ({ id: String(t.id), label: NOM_AFFICHE[t.type_seance] ?? t.type_seance }));
  /** Un type spécial (sport, instruction militaire) n'a ni enseignant ni salle. */
  const estSpecial = (id: string) => !!typesSeance.find(t => String(t.id) === id)?.is_special;

  /**
   * « MPSI B · B1 » pour un plan de la classe affichée, « MPSI B » pour la
   * classe entière — écrit comme l'occupation et le refus du serveur.
   */
  const nomDuPlan = (sousGroupe: string) => {
    const nom = classe?.nom ?? 'cette classe';
    if (!sousGroupe) return nom;
    const sg = sousGroupes.find(g => String(g.id) === sousGroupe);
    return sg ? `${nom} · ${sg.libelle}` : nom;
  };

  /**
   * Les enseignants et salles déjà pris sur ce créneau, avec le groupe qui les
   * tient (id → « MPSI B · B1 »).
   *
   * Deux sources : la grille en cours d'édition, et les autres classes de la
   * même période. La seconde manquait, et c'est par là qu'un professeur se
   * retrouvait sur deux classes à la même heure — jusque dans le suivi, où ses
   * heures étaient comptées deux fois.
   *
   * Ils ne sont plus retirés des listes mais grisés (16/10/2026) : un nom qui
   * disparaît se lit comme un oubli du référentiel, un nom grisé qui dit où il
   * est pris se comprend tout seul.
   */
  const occupes = (jour: number, creneau: number, kCourant: string) => {
    const profs = new Map<string, string>(), salles = new Map<string, string>();

    for (const o of occupation) {
      if (o.jour !== jour || o.creneau !== creneau) continue;
      if (o.prof)  noterPris(profs,  String(o.prof),  o.classe);
      if (o.salle) noterPris(salles, String(o.salle), o.classe);
    }

    for (const [k, v] of Object.entries(cases)) {
      if (k === kCourant || !v.matiereId) continue;
      // Le conflit se juge sur la case horaire complète, jour compris : un
      // enseignant peut évidemment assurer le créneau de 09h45 le lundi ET le
      // mardi. Ne comparer que le créneau le rendait indisponible toute la
      // semaine dès qu'il était placé une fois.
      const [kJour, kCreneau, kSousGroupe] = k.split('__');
      if (Number(kJour) !== jour || Number(kCreneau) !== creneau) continue;
      if (v.profId)  noterPris(profs,  v.profId,  nomDuPlan(kSousGroupe));
      if (v.salleId) noterPris(salles, v.salleId, nomDuPlan(kSousGroupe));
    }
    return { profs, salles };
  };

  const modifie   = JSON.stringify(cases) !== JSON.stringify(originaux.current);
  // Le gestionnaire `beforeunload` est posé une seule fois : il lit la
  // référence, pas la valeur figée à l'enregistrement de l'écouteur.
  modifieRef.current = modifie;
  const nbSeances = Object.values(cases).filter(c => c.matiereId).length;

  /**
   * Exécute un geste qui recharge la grille, en demandant d'abord si des
   * modifications non enregistrées sont en jeu.
   */
  const siEnregistre = (message: string, faire: () => void) => {
    if (!modifie) { faire(); return; }
    setAConfirmer({ message, faire });
  };

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
            {/* Le sens inverse. Il vit ici et non dans l'écran hebdomadaire :
                c'est le PATRON qu'on remplit, et c'est l'écran du patron. */}
            <button onClick={() => setReportOuvert(true)} className={BTN_SECONDAIRE}>
              <ArrowDownToLine size={14} /> Reprendre une semaine
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
                      const cible = e.target.value ? Number(e.target.value) : null;
                      siEnregistre(MSG_CLASSE, () => {
                        setClasseId(cible);
                        setVue('');   // la vue d'une classe n'a pas de sens sur une autre
                        // La semaine non plus : chaque niveau a ses propres
                        // semaines. Garder l'identifiant de l'ancienne faisait
                        // interroger la nouvelle classe sur une semaine qui ne
                        // lui appartient pas — grille vide, et bandeau décrivant
                        // une semaine qu'on ne regarde pas.
                        setPeriodeId(null);
                      });
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
              <button onClick={() => siEnregistre(MSG_PERIODE, () => {
                        const i = semainesCours.findIndex(s => s.id === periodeId);
                        setPeriodeId(i <= 0 ? null : semainesCours[i - 1].id);
                      })}
                      disabled={periodeId === null}
                      title="Période précédente"
                      className="p-2.5 rounded-xl border border-gray-200 text-iss-gray hover:bg-gray-50 disabled:opacity-40 transition-colors">
                <ChevronLeft size={14} />
              </button>
              <select value={periodeId ?? ''} className={SELECT} style={{ minWidth: 190 }}
                      onChange={e => {
                        const cible = e.target.value ? Number(e.target.value) : null;
                        siEnregistre(MSG_PERIODE, () => setPeriodeId(cible));
                      }}>
                <option value="">Grille type (toutes semaines)</option>
                {semainesCours.map(s => (
                  <option key={s.id} value={s.id}>
                    {libelleSemaine(s)} · {new Date(s.date_debut).toLocaleDateString('fr-FR')}
                  </option>
                ))}
              </select>
              <button onClick={() => siEnregistre(MSG_PERIODE, () => {
                        const i = semainesCours.findIndex(s => s.id === periodeId);
                        if (i < semainesCours.length - 1) setPeriodeId(semainesCours[i + 1].id);
                      })}
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

      {/* Sans cette lecture, les listes proposent tout le monde : le dire,
          plutôt que de laisser le refus tomber à l'enregistrement. */}
      {classeId && occupationIllisible && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl px-5 py-3
                        text-xs text-amber-900">
          <strong>Disponibilités non vérifiées.</strong>{' '}
          Les enseignants et salles déjà pris dans les autres classes n&apos;ont
          pas pu être lus : l&apos;enregistrement refusera un éventuel doublon.
        </div>
      )}

      {/* C'est ici qu'on provoque la divergence — et ici qu'on la corrige. */}
      {enModeSemaine && <BandeauCoherence semaine={semaine} />}
      {enModeSemaine && <BandeauFeries jours={semaine?.jours_feries ?? []} />}

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
                ? `${semaine ? libelleSemaine(semaine) : 'Semaine'} — cette semaine seulement`
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
                  {jours.map((j, ligne) => {
                    const ferme = joursFermes.get(j.id);
                    return (
                    <tr key={j.id} style={{
                      background: ferme ? FOND_JOUR_FERME : (ligne % 2 === 0 ? 'white' : '#fafafa'),
                    }}>
                      <td style={ferme ? { ...STYLE_CELLULE_JOUR, background: FOND_JOUR_FERME } : STYLE_CELLULE_JOUR}>
                        {ferme ? <EnteteJourFerme jour={j.jour} ferme={ferme} /> : j.jour}
                      </td>
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

                        const pris = occupes(j.id, c.id, k);

                        // Les noms pris restent dans la liste, grisés et
                        // inertes, avec le groupe qui les tient ; l'infobulle
                        // du champ les résume sans avoir à l'ouvrir.
                        const masques = (
                          options: OptionAC[], occupesIci: Map<string, string>,
                          choisi: string,
                        ) => {
                          const noms = options
                            .filter(o => occupesIci.has(o.id) && o.id !== choisi)
                            .map(o => `${o.label} — ${occupesIci.get(o.id)}`);
                          return noms.length
                            ? `Déjà pris sur ce créneau : ${noms.join(' · ')}`
                            : undefined;
                        };

                        // La case prend la couleur de son type — bleu pour un
                        // cours, vert pour un TD, orange pour un TP, violet
                        // pour un DS. C'est ce qui remplace la pastille : la
                        // grille se lit d'un coup d'oeil, sans rien répéter.
                        const libelleType = typesSeance.find(
                          t => String(t.id) === cellule.typeSeance)?.type_seance;
                        const coul = couleurType(libelleType);
                        const speciale = estSpecial(cellule.typeSeance);
                        const occupee = !!cellule.matiereId || speciale;

                        // ── JOUR FERMÉ ─────────────────────────────────────
                        // Case vide : un bloc rayé, pas des champs grisés — vides
                        // et désactivés, ils se lisaient comme une saisie en panne.
                        // Case occupée : la séance, figée, sans corbeille,
                        // permutation ni menu. Le serveur refuse ces gestes ; ne
                        // pas les montrer évite d'en tenter un.
                        if (ferme) {
                          const reelle = cellule.idOrigine
                            ? seancesSemaine.find(s => s.id === cellule.idOrigine)
                            : undefined;
                          if (!reelle) {
                            return (
                              <td key={c.id} style={{ ...STYLE_CELLULE, background: FOND_JOUR_FERME }}>
                                <CaseFeriee libelle={ferme.libelle} />
                              </td>
                            );
                          }
                          return (
                            <td key={c.id} style={{
                              ...STYLE_CELLULE, background: FOND_JOUR_FERME,
                              borderLeft: `3px solid ${coul.border}`,
                            }}>
                              <div style={{ opacity: 0.7 }}>
                                {!speciale && (
                                  <AC value={cellule.profId} placeholder="Professeur" disabled
                                      options={optProfs} onChange={() => {}} />
                                )}
                                {!speciale && (
                                  <AC value={cellule.matiereId} placeholder="Matière" disabled
                                      options={optMatieres} onChange={() => {}} />
                                )}
                                <AC value={cellule.typeSeance} placeholder="Type séance" disabled
                                    options={optTypes} onChange={() => {}} />
                                {!speciale && (
                                  <AC value={cellule.salleId} placeholder="Salle" disabled
                                      options={optSalles} onChange={() => {}} />
                                )}
                              </div>
                              {reelle.annulee && (
                                <div className="mt-1 pt-1 border-t border-gray-200/70"
                                     style={{ fontSize: 9, fontWeight: 800, color: '#b91c1c' }}>
                                  {reelle.motif_annulation === 'ferie' ? 'ANNULÉE — FÉRIÉ' : 'ANNULÉE'}
                                </div>
                              )}
                            </td>
                          );
                        }

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
                                <div title={masques(optProfs, pris.profs, cellule.profId)}>
                                  <AC value={cellule.profId} placeholder="Professeur"
                                      disabled={estHerite}
                                      options={avecDispo(optProfs, pris.profs, cellule.profId)}
                                      onChange={v => majCase(k, 'profId', v)} />
                                </div>
                              )}
                              {!speciale && (
                                <AC value={cellule.matiereId} options={optMatieres} placeholder="Matière"
                                    disabled={estHerite}
                                    onChange={v => majCase(k, 'matiereId', v)} />
                              )}
                              <AC value={cellule.typeSeance} options={optTypes} placeholder="Type séance"
                                  disabled={estHerite}
                                  onChange={v => majCase(k, 'typeSeance', v)} />
                              {!speciale && (
                                <div title={masques(optSalles, pris.salles, cellule.salleId)}>
                                  <AC value={cellule.salleId} placeholder="Salle"
                                      disabled={estHerite}
                                      options={avecDispo(optSalles, pris.salles, cellule.salleId)}
                                      onChange={v => majCase(k, 'salleId', v)} />
                                </div>
                              )}

                              {/* Gestes propres à une séance datée. Ils n'ont
                                  pas d'objet sur le patron : on n'annule ni ne
                                  permute un modèle, et on ne fait pas l'appel
                                  sur une case théorique. */}
                              {/* Les actions étaient trois icônes nues de 11 px
                                  séparées de 6 px : la zone cliquable se
                                  confondait avec le dessin, et « Vider » —
                                  destructeur — jouxtait « Permuter ». Chacune
                                  a désormais sa surface, et la destruction est
                                  mise à l'écart, à droite, derrière un trait. */}
                              {((enModeSemaine && cellule.idOrigine)
                                || ((cellule.matiereId || speciale) && !estHerite)) && (
                                <div className="flex items-center gap-0.5 mt-1 pt-1 border-t border-gray-200/70">
                                  {enModeSemaine && cellule.idOrigine && (() => {
                                    const reelle = seancesSemaine.find(s => s.id === cellule.idOrigine);
                                    if (!reelle) return null;
                                    return (
                                      <>
                                        <button onClick={() => setPermutation(reelle)}
                                                title="Permuter les enseignants"
                                                className={BOUTON_CASE + ' hover:bg-violet-50 hover:text-[#7c3aed]'}>
                                          <Repeat size={13} />
                                        </button>
                                        {cellule.annulee && (
                                          <span style={{ fontSize: 9, fontWeight: 700, color: '#b91c1c' }}>
                                            ANNULÉE
                                          </span>
                                        )}
                                      </>
                                    );
                                  })()}

                                  {(cellule.matiereId || speciale) && !estHerite && (
                                    <button onClick={() => viderCase(k)}
                                            title={vue
                                              ? "Retirer cette séance : le sous-groupe reprendra celle de la classe"
                                              : 'Vider la case'}
                                            className={BOUTON_CASE
                                              + ' ml-auto pl-2 border-l border-gray-200/70 rounded-l-none'
                                              + ' hover:bg-red-50 hover:text-red-600'}>
                                      <Trash2 size={13} />
                                      {vue && <span className="text-[9px] font-semibold">Classe</span>}
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                    );
                  })}
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

      {aConfirmer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
             onClick={() => setAConfirmer(null)} role="presentation">
          <div className={`${CARTE} w-full max-w-sm p-5`}
               onClick={e => e.stopPropagation()} role="presentation">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle size={16} className="text-amber-600" />
              <h3 className="text-sm font-bold text-iss-dark">
                Modifications non enregistrées
              </h3>
            </div>
            <p className="text-sm text-iss-gray">{aConfirmer.message}</p>
            {/* « Rester ici » porte le focus : le geste sûr est celui qu'on
                obtient en appuyant sur Entrée sans lire. */}
            <div className="flex gap-2 mt-5">
              <button className={BTN_SECONDAIRE}
                      onClick={() => { const g = aConfirmer.faire; setAConfirmer(null); g(); }}>
                Abandonner les modifications
              </button>
              <button className={BTN_PRIMAIRE} style={{ background: DEGRADE }}
                      autoFocus onClick={() => setAConfirmer(null)}>
                Rester ici
              </button>
            </div>
          </div>
        </div>
      )}

      {duplicationOuverte && grilleId && (
        <ModaleDuplication
          grilleId={grilleId}
          classeId={classeId as number}
          annee={annee}
          niveau={classe?.niveau ?? 'MPSI'}
          typeSemestre={typeSemestre}
          onFerme={() => setDuplicationOuverte(false)}
          onFait={(m) => { setDuplicationOuverte(false); notifier(m); }}
          mutations={mutations}
        />
      )}

      {reportOuvert && grilleId && (
        <ModaleReportSemaine
          grilleId={grilleId}
          classeNom={classe?.nom ?? ''}
          annee={annee}
          niveau={classe?.niveau ?? 'MPSI'}
          typeSemestre={typeSemestre}
          onFerme={() => setReportOuvert(false)}
          onFait={(m) => { setReportOuvert(false); notifier(m); }}
          mutations={mutations}
        />
      )}

      {permutation && (
        <ModalePermutation
          depart={permutation} candidats={candidats}
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
  grilleId, classeId, annee, niveau, typeSemestre, onFerme, onFait, mutations,
}: {
  grilleId: number; classeId: number; annee: string; niveau: NiveauIPGEI;
  typeSemestre: TypeSemestre;
  onFerme: () => void; onFait: (message: string) => void; mutations: Mutations;
}) {
  const { data: semestres = [] } = useSemestresAll({ annee_universitaire: annee });
  const candidats = semestres.filter(
    s => s.niveaux.includes(niveau) && s.type_semestre === typeSemestre);

  const [semestre, setSemestre] = useState<number | null>(candidats[0]?.id ?? null);
  // CE QU'ON DUPLIQUE. Le patron est un modèle abstrait qu'il faut remplir à
  // part ; à l'usage, on bâtit plutôt une semaine sur l'écran hebdomadaire et
  // l'on veut les suivantes identiques. Les deux sources ont leur emploi, mais
  // il fallait pouvoir le DIRE — sans ce choix, la duplication partait d'un
  // patron vide et ne produisait rien, ce qui se lisait comme une panne.
  const [source, setSource] = useState<'patron' | 'semaine'>('patron');
  const [semaineSource, setSemaineSource] = useState<number | null>(null);
  const [portee, setPortee]     = useState<'tout' | 'lot'>('tout');
  const [semaineDebut, setSemaineDebut] = useState<number | null>(null);
  const [nbSemaines, setNbSemaines]     = useState('4');
  const [ecraser, setEcraser] = useState(false);
  const [erreur, setErreur]   = useState<string | null>(null);

  const { data: semaines = [] } = useSemaines(semestre);
  const semainesCours = semaines.filter(s => s.type_semaine === 'cours');
  const enCours = mutations.dupliquer.isPending || mutations.dupliquerSemaine.isPending;

  // On dépend de l'identifiant, pas du tableau : `candidats` naît d'un
  // `.filter()` et change d'identité à chaque rendu, ce qui relancerait
  // l'effet en boucle.
  const premierCandidat = candidats[0]?.id ?? null;
  useEffect(() => {
    if (!semestre && premierCandidat) setSemestre(premierCandidat);
  }, [premierCandidat, semestre]);

  /** Rendu compte d'une duplication qui a écarté des cases. */
  const [bilan, setBilan] = useState<
    (ResultatDuplication & { resume: string }) | null>(null);

  const lancer = () => {
    if (!semestre) { setErreur('Choisissez un semestre.'); return; }
    if (portee === 'lot' && !semaineDebut) { setErreur('Choisissez la semaine de départ.'); return; }
    if (source === 'semaine' && !semaineSource) {
      setErreur('Choisissez la semaine à recopier.'); return;
    }
    setErreur(null);

    // Le compte rendu ne dépend pas de la source : mêmes règles, même bilan.
    const rendre = {
      onSuccess: (r: ResultatDuplication) => {
        const resume =
          `${r.creees} séance(s) créée(s) sur ${r.semaines_traitees} semaine(s)`
          + (r.remplacees ? ` — ${r.remplacees} remplacée(s)` : '')
          + (r.ignorees ? ` — ${r.ignorees} case(s) déjà occupée(s), laissée(s) intacte(s)` : '');
        // Des cases écartées ne se disent pas dans un message qui s'efface :
        // il manque des séances à la semaine, et il faut pouvoir lire
        // lesquelles pour aller les replacer. La fenêtre reste donc ouverte.
        if (r.conflits) { setBilan({ resume, ...r }); return; }
        onFait(resume);
      },
      onError: (e: unknown) => setErreur(e instanceof Error ? e.message : 'Erreur'),
    };

    if (source === 'semaine') {
      // Les cibles : tout le semestre, ou le lot demandé — la source exclue,
      // le serveur s'en charge. On envoie des identifiants plutôt qu'un
      // `nb_semaines`, pour que « tout le semestre » veuille dire la même
      // chose des deux côtés.
      const depart = portee === 'lot'
        ? semainesCours.findIndex(s => s.id === semaineDebut) : 0;
      const lot = portee === 'lot'
        ? semainesCours.slice(Math.max(depart, 0), Math.max(depart, 0) + (Number(nbSemaines) || 1))
        : semainesCours;
      mutations.dupliquerSemaine.mutate(
        {
          classe: classeId, semaine_source: semaineSource as number,
          semaines: lot.map(s => s.id).filter(id => id !== semaineSource),
          ecraser,
        },
        rendre,
      );
      return;
    }

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
      rendre,
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
         onClick={onFerme} role="presentation">
      {/* Bornée en hauteur, et défilante. Sans cela, un bilan de vingt cases
          écartées poussait les boutons SOUS LE BORD DE L'ÉCRAN : la fenêtre
          ne se fermait plus, et l'on croyait avoir perdu la validation. */}
      <div className={`${CARTE} w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto`}
           onClick={e => e.stopPropagation()} role="presentation">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-bold text-iss-dark">Dupliquer</h3>
            <p className="text-xs text-iss-gray">
              Déploie le patron <strong>ou</strong> une semaine déjà bâtie sur
              les semaines de cours choisies.
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
            <label className="block text-xs font-semibold text-iss-dark mb-1.5">
              Que duplique-t-on ?
            </label>
            <div className="flex gap-2">
              <button onClick={() => setSource('patron')}
                      className={`flex-1 px-3 py-2 rounded-xl border text-sm font-semibold transition-all ${
                        source === 'patron' ? 'bg-[#006633] text-white border-[#006633]'
                                            : 'bg-white text-iss-gray border-gray-200'}`}>
                Le patron
              </button>
              <button onClick={() => setSource('semaine')}
                      className={`flex-1 px-3 py-2 rounded-xl border text-sm font-semibold transition-all ${
                        source === 'semaine' ? 'bg-[#006633] text-white border-[#006633]'
                                             : 'bg-white text-iss-gray border-gray-200'}`}>
                Une semaine précise
              </button>
            </div>
            {/* Le patron est vide tant qu'on ne l'a pas rempli sur CET écran.
                Le dire ici évite la duplication qui ne produit rien et qu'on
                prend pour une panne. */}
            <p className="text-xs text-iss-gray mt-1.5">
              {source === 'patron'
                ? 'La grille type que vous composez sur cet écran.'
                : "Les séances d'une semaine déjà bâtie, telles qu'elles sont."}
            </p>
          </div>

          {source === 'semaine' && (
            <div>
              <label className="block text-xs font-semibold text-iss-dark mb-1.5">
                Semaine à recopier <span className="text-red-600">*</span>
              </label>
              <select value={semaineSource ?? ''} className={SELECT}
                      onChange={e => setSemaineSource(e.target.value ? Number(e.target.value) : null)}>
                <option value="">Choisir…</option>
                {semainesCours.map(s => (
                  <option key={s.id} value={s.id}>
                    S{s.numero} · du {new Date(s.date_debut).toLocaleDateString('fr-FR')}
                  </option>
                ))}
              </select>
            </div>
          )}

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

        {bilan && (
          <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-3">
            <div className="flex items-center gap-1.5 text-sm font-bold text-amber-800">
              <AlertTriangle size={14} />
              {bilan.conflits} case(s) écartée(s)
            </div>
            {/* Ce qui a RÉUSSI se dit en premier, et au passé : la duplication
                est déjà enregistrée, il n'y a rien à valider. On lisait
                l'inverse — un encadré d'alerte donne à croire que tout a
                échoué. */}
            <p className="text-xs text-amber-900 mt-1 font-semibold">{bilan.resume}.</p>
            {/* Deux causes possibles, et la phrase n'en nommait qu'une : « un
                enseignant ou une salle » laissait perplexe devant un motif qui
                parle d'épreuve. */}
            <p className="text-xs text-amber-800 mt-1">
              Les cases ci-dessous étaient déjà prises — par une épreuve, ou par
              un enseignant ou une salle engagés ailleurs au même moment. Le
              reste est en place ; celles-ci sont à replacer à la main.
            </p>
            <ul className="mt-2 space-y-0.5 max-h-44 overflow-y-auto">
              {/* Clé par RANG, et non par texte : deux cases distinctes
                  peuvent légitimement produire le même motif, et une clé en
                  double casse le rendu. Le serveur déduplique déjà, mais une
                  liste d'affichage n'a pas à en dépendre — elle ne se
                  réordonne ni ne se filtre. */}
              {(bilan.details_conflits ?? []).map((d, rang) => (
                <li key={rang} className="text-xs text-amber-900 font-mono">{d}</li>
              ))}
            </ul>
            {(bilan.conflits ?? 0) > (bilan.details_conflits?.length ?? 0) && (
              <p className="text-xs text-amber-700 mt-1.5">
                … et {(bilan.conflits ?? 0) - (bilan.details_conflits?.length ?? 0)} autre(s).
              </p>
            )}
          </div>
        )}

        <div className="flex gap-2 mt-5">
          {bilan ? (
            // La duplication est DÉJÀ enregistrée : ce bouton ne valide rien,
            // il ferme. « J'ai noté » le laissait croire l'inverse, et l'on
            // cherchait ce qu'on avait oublié de valider.
            <button onClick={() => onFait(bilan.resume)} className={BTN_PRIMAIRE}
                    style={{ background: DEGRADE }}>
              Fermer — les séances sont enregistrées
            </button>
          ) : (
            <>
              {/* Les deux sources passent par le même bouton : il doit donc
                  attendre CELLE qui tourne, sans quoi on peut relancer une
                  duplication de semaine pendant qu'elle s'exécute. */}
              <button onClick={lancer} disabled={enCours}
                      className={BTN_PRIMAIRE} style={{ background: DEGRADE }}>
                <CopyPlus size={14} /> {enCours
                  ? 'Duplication…'
                  : source === 'semaine' ? 'Dupliquer la semaine' : 'Dupliquer le patron'}
              </button>
              <button onClick={onFerme} className={BTN_SECONDAIRE}>Annuler</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Reprendre une semaine dans le patron ─────────────────────────────────────
/**
 * Le sens inverse de la duplication.
 *
 * Le patron n'appartient à aucun semestre : il tient à la classe et au type de
 * semestre. Rempli une fois, il resservira l'année suivante, là où une semaine
 * réelle meurt avec son année. Personne ne le compose à vide — on bâtit une
 * semaine, puis on la promeut.
 */
function ModaleReportSemaine({
  grilleId, classeNom, annee, niveau, typeSemestre, onFerme, onFait, mutations,
}: {
  grilleId: number; classeNom: string; annee: string; niveau: NiveauIPGEI;
  typeSemestre: TypeSemestre;
  onFerme: () => void; onFait: (message: string) => void; mutations: Mutations;
}) {
  const { data: semestres = [] } = useSemestresAll({ annee_universitaire: annee });
  const semestre = semestres.find(
    s => s.niveaux.includes(niveau) && s.type_semestre === typeSemestre);
  const { data: semaines = [] } = useSemaines(semestre?.id ?? null);
  const semainesCours = semaines.filter(s => s.type_semaine === 'cours');

  const [semaine, setSemaine] = useState<number | null>(null);
  const [ecraser, setEcraser] = useState(false);
  const [erreur, setErreur]   = useState<string | null>(null);

  const lancer = () => {
    if (!semaine) { setErreur('Choisissez la semaine à reprendre.'); return; }
    setErreur(null);
    mutations.reprendreSemaine.mutate(
      { id: grilleId, input: { semaine, ecraser } },
      {
        onSuccess: (r) => onFait(
          `${r.creees} case(s) reprise(s) dans le patron`
          + (r.remplacees ? ` — ${r.remplacees} remplacée(s)` : '')
          + (r.ignorees ? ` — ${r.ignorees} laissée(s) intacte(s)` : '')
          // Le patron ne reproduit alors PAS la semaine qu'on avait sous les
          // yeux : il faut le dire, sinon l'écart se découvre bien plus tard.
          + (r.permutations_normalisees
            ? ` — ${r.permutations_normalisees} permutation(s) ramenée(s) au titulaire`
            : '')),
        onError: (e) => setErreur(e instanceof Error ? e.message : 'Erreur'),
      },
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
         onClick={onFerme} role="presentation">
      <div className={`${CARTE} w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto`}
           onClick={e => e.stopPropagation()} role="presentation">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-bold text-iss-dark">
              Reprendre une semaine dans le patron
            </h3>
            <p className="text-xs text-iss-gray">
              Le patron de {classeNom} n&apos;est lié à aucune année : rempli une
              fois, il resservira l&apos;an prochain.
            </p>
          </div>
          <button onClick={onFerme}
                  className="p-1 rounded-lg text-iss-gray hover:bg-gray-100 transition-colors">
            <X size={14} />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-iss-dark mb-1.5">
              Semaine à reprendre <span className="text-red-600">*</span>
            </label>
            <select value={semaine ?? ''} className={SELECT}
                    onChange={e => setSemaine(e.target.value ? Number(e.target.value) : null)}>
              <option value="">Choisir…</option>
              {semainesCours.map(s => (
                <option key={s.id} value={s.id}>
                  S{s.numero} · du {new Date(s.date_debut).toLocaleDateString('fr-FR')}
                </option>
              ))}
            </select>
            {/* Deux écarts délibérés entre la semaine et le modèle, annoncés
                AVANT de cliquer : les découvrir après serait pire. */}
            <p className="text-xs text-iss-gray mt-1.5">
              Les séances annulées sont ignorées, et une permutation est ramenée
              à son enseignant titulaire — une exception ne fait pas un modèle.
            </p>
          </div>

          <label className="flex items-start gap-2.5 p-3 rounded-xl border border-iss-border
                            bg-gray-50 cursor-pointer">
            <input type="checkbox" checked={ecraser} className="w-4 h-4 mt-0.5 accent-[#006633]"
                   onChange={e => setEcraser(e.target.checked)} />
            <span className="text-sm">
              <span className="font-semibold text-iss-dark">Écraser les cases déjà composées</span>
              <span className="block text-xs text-iss-gray mt-0.5">
                Sans cette option, une case déjà réglée dans le patron est laissée
                telle quelle : on le complète sans défaire ce qu&apos;on y a mis.
              </span>
            </span>
          </label>

          {erreur && <Erreur erreur={new Error(erreur)} />}
        </div>

        <div className="flex gap-2 mt-5">
          <button onClick={lancer} disabled={mutations.reprendreSemaine.isPending}
                  className={BTN_PRIMAIRE} style={{ background: DEGRADE }}>
            <ArrowDownToLine size={14} />
            {mutations.reprendreSemaine.isPending ? 'Report…' : 'Reprendre'}
          </button>
          <button onClick={onFerme} className={BTN_SECONDAIRE}>Annuler</button>
        </div>
      </div>
    </div>
  );
}
