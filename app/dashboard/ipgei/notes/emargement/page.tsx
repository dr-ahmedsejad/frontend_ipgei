'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, ClipboardCheck, Loader2, Save, UserCheck, UserX,
} from 'lucide-react';

import {
  BTN_PRIMAIRE, BTN_SECONDAIRE, Badge, CARTE, Chargement, DEGRADE, EnTetePage,
  Erreur, SELECT, Toast, Vide,
} from '../../_ui';
import { useAnneeIPGEI } from '../../_annee';
import {
  useAbsenceMutations, useClassesSelect, useEpreuves, useFeuilleAppel,
  useMatieresSelect, useSemestresAll,
} from '@/lib/api/ipgei-hooks';
import type { StatutAbsence } from '@/types/ipgei';

/**
 * Émargement d'une épreuve — le pointage du jour de l'examen.
 *
 * C'est le maillon qui manquait entre la salle et la correction. Le jour de
 * l'épreuve, la feuille circule et les candidats signent ; qui n'a pas signé
 * est pointé ici. La saisie se fait PAR EXCEPTION : tout le monde est présent
 * par défaut, on ne coche que les manquants — sur cinquante candidats, cocher
 * quarante-sept présents pour en trouver trois est un travail inutile, et
 * chaque case cochée est une case où l'on peut se tromper.
 *
 * Ce qui est saisi ici ressort sur les FICHES DE COLLECTE : le numéro
 * d'anonymat de l'absent y porte « ABS », et le correcteur ne cherche pas une
 * copie qui n'existe pas. La chaîne est :
 *
 *     séance d'épreuve → émargement → inscription → anonymat → numéro
 *
 * Elle exige donc que l'épreuve soit PLANIFIÉE à l'emploi du temps, en type
 * « EF » ou « DS ». Une épreuve qui ne figure nulle part ne peut pas être
 * pointée — c'est aussi ce qui garantit qu'on pointe la bonne.
 */
export default function EmargementPage() {
  const { annee, setAnnee, options } = useAnneeIPGEI();

  const [semestreId, setSemestreId] = useState<number | null>(null);
  const [classeId, setClasseId]     = useState<number | null>(null);
  const [matiereId, setMatiereId]   = useState<number | null>(null);
  const [seanceId, setSeanceId]     = useState<number | null>(null);
  /** Le pointage en cours, tant qu'il n'est pas enregistré. */
  const [saisie, setSaisie] = useState<Record<number, StatutAbsence>>({});
  const [toast, setToast]   = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const { data: semestres = [] } = useSemestresAll({ annee_universitaire: annee });
  const { data: classes  = [] }  = useClassesSelect({
    annee_universitaire: annee, actif: true,
  });
  const semestre = semestres.find(s => s.id === semestreId) ?? null;
  const { data: matieres = [] } = useMatieresSelect({
    code_semestre: semestre?.code, actif: true,
  });

  const { data: epreuves = [], isLoading: chargeEpreuves } = useEpreuves({
    semestre: semestreId, classe: classeId, matiere: matiereId,
  });
  const { data: feuille, isLoading: chargeFeuille } = useFeuilleAppel(seanceId);
  const { saisir } = useAbsenceMutations();

  // Une séance choisie puis écartée par un filtre resterait affichée : la
  // feuille montrerait une classe que la liste au-dessus ne propose plus.
  useEffect(() => {
    if (seanceId && epreuves.length && !epreuves.some(e => e.id === seanceId)) {
      setSeanceId(null);
    }
  }, [epreuves, seanceId]);

  // Le pointage repart de ce qui est DÉJÀ enregistré : rouvrir une feuille pour
  // corriger une ligne ne doit pas effacer les autres.
  useEffect(() => {
    if (!feuille) return;
    const connu: Record<number, StatutAbsence> = {};
    for (const absent of feuille.absents) connu[absent.inscription] = absent.statut;
    setSaisie(connu);
  }, [feuille]);

  const compte = useMemo(() => {
    const valeurs = Object.values(saisie);
    return {
      absents:    valeurs.filter(v => v === 'absent').length,
      justifiees: valeurs.filter(v => v === 'justifiee').length,
      retards:    valeurs.filter(v => v === 'retard').length,
    };
  }, [saisie]);

  const presents = (feuille?.classe.length ?? 0)
    - compte.absents - compte.justifiees;

  const basculer = (inscription: number, statut: StatutAbsence | null) => {
    setSaisie(precedent => {
      const suite = { ...precedent };
      if (statut === null) delete suite[inscription];
      else suite[inscription] = statut;
      return suite;
    });
  };

  const enregistrer = () => {
    if (!seanceId) return;
    setErreur(null);
    saisir.mutate(
      {
        seance:  seanceId,
        absents: Object.entries(saisie).map(([inscription, statut]) => ({
          inscription: Number(inscription), statut,
        })),
      },
      {
        onSuccess: () => {
          setToast('Émargement enregistré — les fiches de collecte le reprendront.');
          setTimeout(() => setToast(null), 3200);
        },
        onError: (e) => setErreur(e instanceof Error ? e.message : 'Erreur'),
      });
  };

  const libelleEpreuve = (e: typeof epreuves[number]) =>
    `${e.type_seance_libelle} · ${e.matiere_intitule || 'sans matière'} · `
    + `${e.classe_nom} · ${e.date || `semaine ${e.semaine_numero ?? '?'}`}`
    + ` · ${e.creneau_libelle}`;

  return (
    <div className="space-y-5 max-w-4xl">
      <Link href="/dashboard/ipgei/notes"
            className="inline-flex items-center gap-1.5 text-sm text-iss-gray hover:text-[#006633] transition-colors">
        <ArrowLeft size={14} /> Saisie des notes
      </Link>

      <EnTetePage
        icone={<ClipboardCheck size={14} className="text-white" />}
        titre="Émargement des épreuves"
        sousTitre="Qui n'a pas signé le jour de l'épreuve — repris ensuite sur les fiches de collecte."
        actions={
          <select value={annee} className={SELECT} style={{ width: 140 }}
                  onChange={e => { setAnnee(e.target.value); setSemestreId(null); setSeanceId(null); }}>
            {options.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        }
      />

      <div className={`${CARTE} p-6 space-y-4`}>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="block text-xs font-semibold text-iss-dark mb-1.5">
              Semestre <span className="text-red-600">*</span>
            </label>
            <select value={semestreId ?? ''} className={SELECT}
                    onChange={e => { setSemestreId(e.target.value ? Number(e.target.value) : null);
                                     setMatiereId(null); setSeanceId(null); }}>
              <option value="">— Choisir —</option>
              {semestres.map(s => (
                <option key={s.id} value={s.id}>{s.code} — {s.libelle_annee}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-iss-dark mb-1.5">Classe</label>
            <select value={classeId ?? ''} className={SELECT}
                    onChange={e => { setClasseId(e.target.value ? Number(e.target.value) : null);
                                     setSeanceId(null); }}>
              <option value="">Toutes les classes</option>
              {classes.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-iss-dark mb-1.5">Matière</label>
            <select value={matiereId ?? ''} className={SELECT} disabled={!semestreId}
                    onChange={e => { setMatiereId(e.target.value ? Number(e.target.value) : null);
                                     setSeanceId(null); }}>
              <option value="">Toutes les matières</option>
              {matieres.map(m => <option key={m.id} value={m.id}>{m.intitule}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-iss-dark mb-1.5">
            Épreuve <span className="text-red-600">*</span>
          </label>
          <select value={seanceId ?? ''} className={SELECT} disabled={!epreuves.length}
                  onChange={e => setSeanceId(e.target.value ? Number(e.target.value) : null)}>
            <option value="">— Choisir l&apos;épreuve —</option>
            {epreuves.map(e => (
              <option key={e.id} value={e.id}>{libelleEpreuve(e)}</option>
            ))}
          </select>
          {/* Sans épreuve planifiée, il n'y a rien à pointer — et le dire vaut
              mieux que de laisser une liste vide sans explication. */}
          {semestreId && !chargeEpreuves && !epreuves.length && (
            <p className="text-xs text-amber-700 mt-2">
              Aucune épreuve planifiée sur ce semestre. Une épreuve se pose à
              l&apos;emploi du temps en type <b>DS</b> ou <b>EF</b>, depuis{' '}
              <Link href="/dashboard/ipgei/edt/semaine"
                    className="text-[#006633] font-medium hover:underline">
                Emploi du temps → Semaine
              </Link>. C&apos;est elle qui porte l&apos;émargement.
            </p>
          )}
        </div>
      </div>

      {chargeFeuille && <Chargement />}

      {feuille && (
        <div className={`${CARTE} p-6 space-y-4`}>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-sm font-bold text-iss-dark">
                {feuille.seance.classe_nom} — {feuille.seance.matiere_intitule}
              </h2>
              <p className="text-xs text-iss-gray mt-0.5">
                {feuille.seance.type_seance_libelle} ·{' '}
                {feuille.seance.date || `semaine ${feuille.seance.semaine_numero ?? '?'}`} ·{' '}
                {feuille.seance.creneau_libelle}
                {feuille.seance.salle_nom && ` · ${feuille.seance.salle_nom}`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge ton="vert">{presents} présent{presents > 1 ? 's' : ''}</Badge>
              {compte.absents > 0 && (
                <Badge ton="rouge">{compte.absents} absent{compte.absents > 1 ? 's' : ''}</Badge>
              )}
              {compte.justifiees > 0 && (
                <Badge ton="ambre">{compte.justifiees} justifiée{compte.justifiees > 1 ? 's' : ''}</Badge>
              )}
            </div>
          </div>

          {/* La saisie est par EXCEPTION : ne rien cocher vaut « tout le monde
              était là ». C'est ce qui rend le pointage tenable en fin d'épreuve. */}
          <p className="text-xs text-iss-gray">
            Tout le monde est <b>présent</b> par défaut : ne pointez que ceux qui
            n&apos;ont pas signé. L&apos;absence — justifiée ou non — fera porter{' '}
            <b>ABS</b> sur le numéro d&apos;anonymat de la fiche du correcteur. Le
            retard, lui, ne change rien : la copie existe.
          </p>
          {/* Les deux chemins de pointage sont lus par la fiche. Le dire ici
              évite de pointer deux fois la même épreuve par précaution. */}
          <p className="text-xs text-iss-gray">
            Le pointage fait depuis le <b>Suivi</b> (module ABS) compte tout
            autant : la fiche lit les deux. Inutile de saisir deux fois.
          </p>

          {!feuille.classe.length ? (
            <Vide texte="Aucun inscrit actif dans cette classe." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-iss-gray border-b border-slate-100">
                    <th className="py-2 pr-3 font-semibold">#</th>
                    <th className="py-2 pr-3 font-semibold">Étudiant</th>
                    <th className="py-2 pr-3 font-semibold">Matricule</th>
                    <th className="py-2 font-semibold">Pointage</th>
                  </tr>
                </thead>
                <tbody>
                  {feuille.classe.map((inscription, rang) => {
                    const statut = saisie[inscription.id] ?? null;
                    const bouton = (
                      valeur: StatutAbsence | null, libelle: string, actif: string,
                    ) => (
                      <button key={libelle}
                              onClick={() => basculer(inscription.id, valeur)}
                              className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                                statut === valeur
                                  ? actif
                                  : 'border-slate-200 text-iss-gray hover:bg-slate-50'}`}>
                        {libelle}
                      </button>
                    );
                    return (
                      <tr key={inscription.id}
                          className={`border-b border-slate-50 ${
                            statut === 'absent' || statut === 'justifiee'
                              ? 'bg-amber-50/40' : ''}`}>
                        <td className="py-2 pr-3 text-xs text-iss-gray">{rang + 1}</td>
                        <td className="py-2 pr-3 text-iss-dark">{inscription.etudiant_nom}</td>
                        <td className="py-2 pr-3 text-xs text-iss-gray">
                          {inscription.etudiant_matricule}
                        </td>
                        <td className="py-2">
                          <div className="flex gap-1.5 flex-wrap">
                            {bouton(null, 'Présent',
                                    'border-[#006633] bg-[#006633] text-white')}
                            {bouton('absent', 'Absent',
                                    'border-red-600 bg-red-600 text-white')}
                            {bouton('justifiee', 'Justifiée',
                                    'border-amber-500 bg-amber-500 text-white')}
                            {bouton('retard', 'Retard',
                                    'border-slate-500 bg-slate-500 text-white')}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {erreur && <Erreur erreur={new Error(erreur)} />}

          <div className="flex items-center gap-3 flex-wrap pt-1">
            <button onClick={enregistrer} disabled={saisir.isPending}
                    className={BTN_PRIMAIRE} style={{ background: DEGRADE }}>
              {saisir.isPending
                ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Enregistrer l&apos;émargement
            </button>
            {/* Tout effacer d'un geste : après une épreuve reportée, reprendre
                trente lignes une à une découragerait la correction. */}
            <button onClick={() => setSaisie({})} disabled={!Object.keys(saisie).length}
                    className={BTN_SECONDAIRE}>
              <UserCheck size={14} /> Tous présents
            </button>
            <Link href="/dashboard/ipgei/notes/secretariat"
                  className="text-xs text-[#006633] font-medium hover:underline inline-flex items-center gap-1">
              <UserX size={13} /> Éditer les fiches de collecte
            </Link>
          </div>
        </div>
      )}

      <Toast message={toast} />
    </div>
  );
}
