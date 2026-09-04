'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ClipboardSignature, Download, Loader2 } from 'lucide-react';

import { downloadBlob } from '@/lib/downloadBlob';
import {
  BTN_PRIMAIRE, CARTE, DEGRADE, EnTetePage, Erreur, SELECT,
} from '../../_ui';
import { useAnneeIPGEI } from '../../_annee';
import {
  useClassesSelect, useFicheEmargement, useInscriptionsAll, useMatieresSelect,
  useSemestresAll,
} from '@/lib/api/ipgei-hooks';
import { useSallesList } from '@/lib/api/salles-hooks';
import type { TypeNoteCollecte } from '@/lib/api/ipgei';

/**
 * Fiche d'émargement d'une épreuve — la feuille que le surveillant fait signer.
 *
 * Deux colonnes vides, « Entrée » et « Sortie » : le candidat émarge en arrivant
 * et en partant, et c'est ce couple qui atteste la durée de présence. Aucune
 * note n'y figure — la fiche de collecte s'en charge.
 *
 * Les candidats et leur ORDRE sont ceux de la fiche de collecte de la même
 * épreuve : le surveillant appelle les noms pendant que la scolarité tient la
 * collecte, et deux ordres différents décaleraient l'appel.
 */

const TYPES: { cle: TypeNoteCollecte; label: string }[] = [
  { cle: 'DS',   label: 'Devoir surveillé' },
  { cle: 'TP',   label: 'Travaux pratiques' },
  { cle: 'EXAM', label: 'Examen final' },
  { cle: 'RATT', label: 'Examen de rattrapage' },
];

export default function FicheEmargementPage() {
  const { annee, setAnnee, options } = useAnneeIPGEI();

  const [semestreId, setSemestreId] = useState<number | null>(null);
  // Les classes retenues, DANS L'ORDRE du choix. La première commande le
  // niveau, donc les semestres et les matières proposés ; les suivantes se
  // mélangent à elle. Une seule cochée, on retrouve le comportement d'avant.
  const [classesIds, setClassesIds] = useState<number[]>([]);
  // Le NIVEAU se choisit d'abord, et la liste ne montre alors que ses classes.
  // Les afficher toutes invitait à cocher une MPSI avec une MP : deux années
  // qui ne composent pas la même épreuve.
  const [niveau,     setNiveau]     = useState<string>('');
  const [matiereId,  setMatiereId]  = useState<number | null>(null);
  const [typeNote,   setTypeNote]   = useState<TypeNoteCollecte>('EXAM');
  // Les salles retenues, DANS L'ORDRE du choix : c'est cet ordre qui décide
  // quel groupe compose où. Un Set le perdrait, et les candidats changeraient
  // de salle d'une édition à l'autre.
  //
  // `places` = les sièges qu'on ouvre réellement. La capacité du référentiel
  // est la capacité PHYSIQUE ; on en ouvre parfois moins — un rang condamné,
  // un espacement voulu. On peut donc l'abaisser, jamais la dépasser.
  const [retenues, setRetenues] = useState<{ id: number; places: number }[]>([]);
  const [erreur,     setErreur]     = useState<string | null>(null);

  const { data: semestres = [] } = useSemestresAll({ annee_universitaire: annee });
  const { data: classes   = [] } = useClassesSelect({ annee_universitaire: annee, actif: true });
  const { data: sallesPage } = useSallesList({ page_size: 200 });
  const editer = useFicheEmargement();

  const salles = useMemo(() => sallesPage?.results ?? [], [sallesPage]);

  const semestre = semestres.find(s => s.id === semestreId) ?? null;
  const classeId = classesIds[0] ?? null;
  const classe   = classes.find(c => c.id === classeId) ?? null;
  const rattrapage = typeNote === 'RATT';

  const classesReelles = useMemo(
    () => classes.filter(c => !c.est_conteneur), [classes]);

  // Les niveaux réellement ouverts cette année-là — pas une liste figée : une
  // année sans deuxième année ne doit pas proposer MP.
  const niveaux = useMemo(
    () => [...new Set(classesReelles.map(c => c.niveau))].sort(),
    [classesReelles],
  );
  const classesDuNiveau = useMemo(
    () => classesReelles.filter(c => c.niveau === niveau), [classesReelles, niveau]);

  // Le mélange est propre à l'EXAMEN : un devoir surveillé et un TP se
  // composent en classe, avec l'enseignant de la matière. Le serveur le refuse
  // aussi — l'écran ne fait que ne pas le proposer.
  const melangePossible = typeNote === 'EXAM' || typeNote === 'RATT';

  // Un semestre appartient à une année d'étude : on ne propose que ceux que
  // suit le niveau de la classe choisie.
  const semestresOuverts = useMemo(
    () => (classe ? semestres.filter(s => s.niveaux.includes(classe.niveau)) : semestres),
    [semestres, classe],
  );

  // Les matières suivent le semestre, et le TP ne concerne que celles qui en
  // comportent : proposer les autres produirait une feuille que personne
  // n'émargera.
  const { data: matieres = [] } = useMatieresSelect({
    code_semestre: semestre?.code, actif: true,
    ...(typeNote === 'TP' ? { has_tp: true } : {}),
  });

  // L'effectif, pour dire AVANT l'édition si les places suffisent. Une seule
  // requête sur l'année, comptée par classe : une par classe mélangée
  // multiplierait les allers-retours sans rien apprendre de plus.
  // En rattrapage il majore la réalité — seuls les étudiants sous le seuil sont
  // convoqués — d'où la mention qui l'accompagne à l'écran.
  const { data: inscriptions } = useInscriptionsAll(
    annee ? { annee_universitaire: annee, actif: true } : undefined);
  const effectif = useMemo(() => {
    if (!inscriptions || !classesIds.length) return null;
    return inscriptions.filter(i => classesIds.includes(i.classe)).length;
  }, [inscriptions, classesIds]);

  const placesRetenues = useMemo(
    () => retenues.reduce((total, r) => total + r.places, 0), [retenues]);

  // La capacité TOTALE des salles cochées — le repère de ce qu'on ouvre. Sans
  // elle, « 73 places ouvertes pour 73 inscrits » laisse croire que les salles
  // sont pleines, alors qu'on peut n'en ouvrir que dix par salle.
  const capaciteTotale = useMemo(
    () => retenues.reduce(
      (total, r) => total + (salles.find(s => s.id === r.id)?.capacite ?? 0), 0),
    [retenues, salles],
  );
  const placesManquantes =
    effectif !== null && retenues.length > 0 && typeNote !== 'RATT'
      ? Math.max(0, effectif - placesRetenues)
      : 0;

  // Cochée, une salle s'ouvre à sa capacité du référentiel : c'est le cas
  // courant, et faire saisir un nombre à chaque fois ferait payer à tous ce
  // dont peu ont besoin.
  const basculerSalle = (id: number, capacite: number) =>
    setRetenues(actuelles => actuelles.some(r => r.id === id)
      ? actuelles.filter(r => r.id !== id)
      : [...actuelles, { id, places: capacite }]);

  // Bornée à la capacité réelle : le serveur refuserait de toute façon
  // d'ouvrir plus de sièges qu'il n'y en a, autant ne pas laisser le saisir.
  const majPlaces = (id: number, valeur: number, capacite: number) =>
    setRetenues(actuelles => actuelles.map(r => r.id === id
      ? { ...r, places: Math.min(Math.max(1, valeur || 1), capacite) }
      : r));

  const pret = !!semestreId && !!classeId;

  const telecharger = () => {
    if (!pret || !semestre || !classe) return;
    setErreur(null);
    editer.mutate(
      {
        semestre: semestre.id, classe: classe.id,
        // Transmises seulement quand il y a mélange : sans elles, le serveur
        // s'en tient à `classe` et garde l'ordre de la fiche de collecte.
        classes: classesIds.length > 1 ? classesIds.join(',') : undefined,
        matiere: matiereId ?? undefined,
        type_note: typeNote,
        // « 8:20,9 » : l'identifiant, puis les places ouvertes quand elles
        // diffèrent de la capacité du référentiel.
        salles: retenues.length
          ? retenues.map(r => {
              const capacite = salles.find(s => s.id === r.id)?.capacite;
              return r.places === capacite ? String(r.id) : `${r.id}:${r.places}`;
            }).join(',')
          : undefined,
      },
      {
        onSuccess: (blob) => {
          const matiere = matieres.find(m => m.id === matiereId);
          const nom = [
            'emargement',
            classesIds.map(id => classes.find(c => c.id === id))
              .filter(Boolean).map(c => c!.nom.replace(/\s+/g, '_')).join('-'),
            matiere ? matiere.code : 'toutes',
            typeNote, semestre.code,
          ].join('_');
          downloadBlob(blob, `${nom}.pdf`);
        },
        onError: (e) => setErreur(e instanceof Error ? e.message : 'Erreur'),
      },
    );
  };

  return (
    <div className="space-y-5 max-w-2xl">
      <Link href="/dashboard/ipgei/notes"
            className="inline-flex items-center gap-1.5 text-sm text-iss-gray hover:text-[#006633] transition-colors">
        <ArrowLeft size={14} /> Saisie des notes
      </Link>

      <EnTetePage
        icone={<ClipboardSignature size={14} className="text-white" />}
        titre="Fiche d'émargement"
        sousTitre="La feuille que le surveillant fait signer en salle, dans l'ordre exact de la fiche de collecte."
        actions={
          <select value={annee} onChange={e => { setAnnee(e.target.value); setSemestreId(null); }}
                  className={SELECT} style={{ width: 140 }}>
            {options.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        }
      />

      <div className={`${CARTE} p-6 space-y-4`}>

        {/* Le NIVEAU d'abord, les classes ensuite. Une liste de toutes les
            classes laissait cocher une MPSI avec une MP — deux années qui ne
            composent pas la même épreuve. En passant par le niveau, le cas ne
            se présente plus : il n'y a rien à griser, rien à refuser. */}
        <div>
          <label className="block text-xs font-semibold text-iss-dark mb-1.5">
            Niveau <span className="text-red-600">*</span>
          </label>
          <select value={niveau} className={SELECT}
                  onChange={e => { setNiveau(e.target.value);
                                   setClassesIds([]); setSemestreId(null); setMatiereId(null); }}>
            <option value="">— Choisir —</option>
            {niveaux.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>

        {niveau && (
          <div>
            <label className="block text-xs font-semibold text-iss-dark mb-2">
              {melangePossible ? 'Classes qui composent' : 'Classe'}
              <span className="text-red-600"> *</span>
            </label>
            {classesDuNiveau.length === 0 ? (
              <p className="text-xs text-iss-gray">
                Aucune classe de niveau {niveau} en {annee}.
              </p>
            ) : (
              <>
                <div className="grid gap-2 sm:grid-cols-3">
                  {classesDuNiveau.map(c => {
                    const choisie = classesIds.includes(c.id);
                    return (
                      <label key={c.id} className="flex items-center gap-2 cursor-pointer">
                        {/* Case à cocher pour un examen, bouton radio pour un
                            devoir : la forme du contrôle dit à elle seule si
                            plusieurs classes sont permises. */}
                        <input type={melangePossible ? 'checkbox' : 'radio'}
                               name="classe_emargement" className="accent-[#006633]"
                               checked={choisie}
                               onChange={() => setClassesIds(actuelles => {
                                 if (!melangePossible) return [c.id];
                                 const suivantes = actuelles.includes(c.id)
                                   ? actuelles.filter(x => x !== c.id)
                                   : [...actuelles, c.id];
                                 // Vidée ou reprise sur une autre classe de tête,
                                 // la suite du formulaire ne vaut plus.
                                 if (!suivantes.length || suivantes[0] !== actuelles[0]) {
                                   setSemestreId(null); setMatiereId(null);
                                 }
                                 return suivantes;
                               })} />
                        <span className="text-sm text-iss-dark">{c.nom}</span>
                      </label>
                    );
                  })}
                </div>
                {/* Rien à dire quand plusieurs classes sont cochées : le
                    mélange se voit à la sélection elle-même. */}
                {(!melangePossible || classesIds.length <= 1) && (
                  <p className="mt-2 text-xs text-iss-gray">
                    {!melangePossible
                      ? "Un devoir surveillé et un TP se composent en classe : une seule à la fois."
                      : classesIds.length === 0
                        ? 'Cochez une classe, ou plusieurs pour les faire composer ensemble.'
                        : "Une seule classe : la feuille garde l'ordre exact de la fiche de collecte."}
                  </p>
                )}
              </>
            )}
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold text-iss-dark mb-1.5">
            Semestre <span className="text-red-600">*</span>
          </label>
          <select value={semestreId ?? ''} className={SELECT} disabled={!classeId}
                  onChange={e => { setSemestreId(e.target.value ? Number(e.target.value) : null);
                                   setMatiereId(null); }}>
            <option value="">— Choisir —</option>
            {semestresOuverts.map(s => (
              <option key={s.id} value={s.id}>{s.code} — {s.libelle_annee}</option>
            ))}
          </select>
          {classeId && semestresOuverts.length === 0 && (
            <p className="mt-1.5 text-xs text-amber-700">
              Aucun semestre ouvert pour le niveau de cette classe en {annee}.
            </p>
          )}
        </div>

        <div>
          <label className="block text-xs font-semibold text-iss-dark mb-1.5">Matière</label>
          <select value={matiereId ?? ''} className={SELECT} disabled={!semestreId}
                  onChange={e => setMatiereId(e.target.value ? Number(e.target.value) : null)}>
            <option value="">Toutes les matières du semestre</option>
            {matieres.map(m => (
              <option key={m.id} value={m.id}>{m.intitule}</option>
            ))}
          </select>
          <p className="mt-1.5 text-xs text-iss-gray">
            Laissée sur «&nbsp;toutes&nbsp;», l&apos;édition produit le jeu complet
            de la classe — une fiche par matière, chacune sur sa page.
          </p>
        </div>

        <div>
          <label className="block text-xs font-semibold text-iss-dark mb-2">
            Type d&apos;épreuve <span className="text-red-600">*</span>
          </label>
          <div className="grid gap-2 sm:grid-cols-2">
            {TYPES.map(t => (
              <label key={t.cle} className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="type_note" value={t.cle}
                       checked={typeNote === t.cle}
                       onChange={() => {
                         setTypeNote(t.cle); setMatiereId(null);
                         // Un devoir ne se mélange pas : on ne garde que la
                         // première classe, plutôt que d'envoyer une sélection
                         // que le serveur refusera.
                         if (t.cle !== 'EXAM' && t.cle !== 'RATT') {
                           setClassesIds(actuelles => actuelles.slice(0, 1));
                         }
                       }}
                       className="accent-[#006633]" />
                <span className="text-sm text-iss-dark">{t.label}</span>
              </label>
            ))}
          </div>
          {rattrapage && (
            <p className="mt-2 text-xs text-amber-700">
              La feuille ne portera que les étudiants dont la moyenne de la
              matière reste sous le seuil : convoquer toute la classe ferait
              émarger des présents qui n&apos;avaient rien à repasser.
            </p>
          )}
        </div>

        {/* Chaque salle cochée est une salle qu'on OUVRE : les candidats se
            répartissent entre elles au prorata des capacités, une fiche par
            salle. Aucune ne dépasse jamais la sienne. */}
        <div>
          <label className="block text-xs font-semibold text-iss-dark mb-2">
            Salles d&apos;examen
          </label>
          <div className="grid gap-2 sm:grid-cols-2">
            {salles.map(s => {
              const rang = retenues.findIndex(r => r.id === s.id);
              const retenue = rang >= 0 ? retenues[rang] : null;
              return (
                <div key={s.id} className="flex items-center gap-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" className="accent-[#006633]"
                           checked={rang >= 0}
                           onChange={() => basculerSalle(s.id, s.capacite)} />
                    <span className="text-sm text-iss-dark">
                      {s.nom} <span className="text-iss-gray">— {s.capacite} places</span>
                      {rang >= 0 && (
                        <span className="ml-1 text-xs font-semibold text-[#006633]">
                          G{rang + 1}
                        </span>
                      )}
                    </span>
                  </label>
                  {/* Ouvre par défaut toute la salle ; abaisser le nombre
                      condamne des places pour cette épreuve seulement, sans
                      toucher au référentiel. */}
                  {retenue && (
                    <input type="number" min={1} max={s.capacite}
                           value={retenue.places}
                           onChange={e => majPlaces(s.id, Number(e.target.value), s.capacite)}
                           title={`Places ouvertes (max ${s.capacite})`}
                           className="w-16 rounded border border-gray-300 px-2 py-1 text-sm text-right" />
                  )}
                </div>
              );
            })}
          </div>

          {retenues.length === 0 ? (
            <p className="mt-2 text-xs text-iss-gray">
              Aucune salle retenue : la fiche s&apos;imprimera en une seule liste,
              avec un blanc à remplir au stylo pour le groupe et la salle.
            </p>
          ) : (
            <p className="mt-2 text-xs text-iss-gray">
              {placesRetenues} place{placesRetenues > 1 ? 's' : ''} ouverte
              {placesRetenues > 1 ? 's' : ''} sur {capaciteTotale} disponible
              {capaciteTotale > 1 ? 's' : ''} dans les salles retenues
              {effectif !== null && <> — {effectif} inscrit{effectif > 1 ? 's' : ''} à placer</>}
              {typeNote === 'RATT' && (
                <> ; en rattrapage, seuls les étudiants sous le seuil seront convoqués,
                   donc moins nombreux.</>
              )}
            </p>
          )}

          {placesManquantes > 0 && (
            /* Annoncé AVANT le clic : le serveur refuserait de toute façon,
               mais découvrir le manque après l'édition fait perdre un aller-retour. */
            <p className="mt-1 text-xs text-amber-700">
              {placesManquantes} candidat{placesManquantes > 1 ? 's' : ''} sans siège :
              ajoutez une salle, ou rendez les places que vous avez retirées.
            </p>
          )}
        </div>

        {erreur && <Erreur erreur={new Error(erreur)} />}

        <button onClick={telecharger} disabled={!pret || editer.isPending}
                className={`${BTN_PRIMAIRE} w-full justify-center`} style={{ background: DEGRADE }}>
          {editer.isPending
            ? <><Loader2 size={14} className="animate-spin" /> Édition en cours…</>
            : <><Download size={14} /> Télécharger la fiche</>}
        </button>
      </div>

    </div>
  );
}
