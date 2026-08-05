'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  CalendarDays, ChevronLeft, ChevronRight, Repeat, UserX,
} from 'lucide-react';

import {
  Badge, CARTE, Chargement, EnTetePage, Erreur, SELECT, Toast, VERT, Vide,
} from '../../_ui';
import { anneeParDefaut, libelleSemestreSession, typeSemestreSession } from '../../_annee';
import { useReferentielsEDT } from '../_referentiels';
import { semaineAProposer } from '../_semaines';
import {
  useClassesSelect, useEdtSemaine, useSemaines, useSemestresAll,
} from '@/lib/api/ipgei-hooks';
import { TYPES_SEANCE, type SeanceReelle } from '@/types/ipgei';
import {
  ModaleAppel, ModaleEditionSeance, ModalePermutation,
} from '../_seance-modales';
import {
  CarteSeance, CaseVide, STYLE_CELLULE, STYLE_CELLULE_JOUR, STYLE_ENTETE_CRENEAU,
  STYLE_ENTETE_JOUR, STYLE_ENTETE_LIGNE, STYLE_TABLE, couleurType,
} from '../_cellule';

export default function EdtSemainePage() {
  // Année et période viennent de la session : elles ont été choisies à la
  // connexion, les redemander ici n'ajouterait rien et permettrait de consulter
  // une période différente de celle qu'on croit ouverte.
  const annee = anneeParDefaut();
  const typeSemestre = typeSemestreSession();

  const [classeId, setClasseId]   = useState<number | null>(null);
  const [semaineId, setSemaineId] = useState<number | null>(null);

  const { data: classes = [] }   = useClassesSelect({ annee_universitaire: annee, actif: true });
  const { data: semestres = [] } = useSemestresAll({ annee_universitaire: annee });
  const classe = classes.find(c => c.id === classeId);

  // Le semestre est entièrement déterminé par le niveau de la classe et la
  // période de session : un seul candidat, donc aucun choix à faire.
  const semestre = useMemo(
    // Le semestre se rattache à une année d'étude, pas à un niveau.
    () => semestres.find(s => classe && s.niveaux.includes(classe.niveau)
                              && s.type_semestre === typeSemestre),
    [classe, semestres, typeSemestre],
  );
  const semestreId = semestre?.id ?? null;
  const { data: semaines = [] } = useSemaines(semestreId);
  const semainesCours = useMemo(
    () => semaines.filter(s => s.type_semaine === 'cours'),
    [semaines],
  );

  // Cale la sélection sur la semaine en cours dès qu'un semestre est choisi :
  // l'écran s'ouvre sur « aujourd'hui » plutôt que sur la semaine 1.
  useEffect(() => {
    if (semainesCours.length === 0) { setSemaineId(null); return; }
    if (semaineId && semainesCours.some(s => s.id === semaineId)) return;
    setSemaineId(semaineAProposer(semainesCours)?.id ?? null);
  }, [semainesCours, semaineId]);

  const { jours, creneaux, salles, profs } = useReferentielsEDT();
  const { data: seances = [], isLoading, error } = useEdtSemaine(classeId, semaineId);

  const [seanceEditee, setSeanceEditee] = useState<SeanceReelle | null>(null);
  const [seanceAppel, setSeanceAppel]   = useState<SeanceReelle | null>(null);
  // Les échanges possibles se choisissent dans la fenêtre : le serveur
  // n'accepte que deux séances de la même classe et du même créneau.
  const [permutation, setPermutation] = useState<SeanceReelle | null>(null);
  const candidats = useMemo(
    () => (permutation
      ? seances.filter(s => s.creneau === permutation.creneau
                         && s.id !== permutation.id)
      : []),
    [permutation, seances],
  );
  const [toast, setToast] = useState<string | null>(null);

  const notifier = (m: string) => { setToast(m); setTimeout(() => setToast(null), 3000); };

  const indexSemaine = semainesCours.findIndex(s => s.id === semaineId);
  const semaine = semainesCours[indexSemaine];
  const naviguer = (pas: number) => {
    const cible = semainesCours[indexSemaine + pas];
    if (cible) setSemaineId(cible.id);
  };

  const seancesDeLaCase = (jour: number, creneau: number) =>
    seances.filter(s => s.jour === jour && s.creneau === creneau);

  return (
    <div className="space-y-5">
      <EnTetePage
        icone={<CalendarDays size={14} className="text-white" />}
        titre="Emploi du temps hebdomadaire"
        sousTitre="Séances générées par duplication de la grille type, éditables sur une semaine ou un lot."
      />

      <div className={`${CARTE} p-4`}>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="block text-xs font-semibold text-iss-dark mb-1.5">Classe</label>
            <select value={classeId ?? ''} className={SELECT}
                    onChange={e => setClasseId(e.target.value ? Number(e.target.value) : null)}>
              <option value="">Choisir…</option>
              {classes.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-iss-dark mb-1.5">Période</label>
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: VERT }} />
              <span className="font-semibold text-iss-dark truncate">
                {annee} · {semestre ? semestre.code : libelleSemestreSession()}
              </span>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-iss-dark mb-1.5">Semaine</label>
            <div className="flex items-center gap-1">
              <button onClick={() => naviguer(-1)} disabled={indexSemaine <= 0}
                      className="p-2.5 rounded-xl border border-gray-200 text-iss-gray hover:bg-gray-50 disabled:opacity-40 transition-colors">
                <ChevronLeft size={14} />
              </button>
              <select value={semaineId ?? ''} className={SELECT} disabled={!semestreId}
                      onChange={e => setSemaineId(e.target.value ? Number(e.target.value) : null)}>
                <option value="">—</option>
                {semainesCours.map(s => (
                  <option key={s.id} value={s.id}>
                    S{s.numero} · {new Date(s.date_debut).toLocaleDateString('fr-FR')}
                  </option>
                ))}
              </select>
              <button onClick={() => naviguer(1)} disabled={indexSemaine >= semainesCours.length - 1}
                      className="p-2.5 rounded-xl border border-gray-200 text-iss-gray hover:bg-gray-50 disabled:opacity-40 transition-colors">
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </div>
      </div>

      <Erreur erreur={error} />

      {!classeId || !semaineId ? (
        <div className={CARTE}>
          <Vide texte="Choisissez une classe, un semestre et une semaine pour afficher l'emploi du temps." />
        </div>
      ) : isLoading ? (
        <div className={CARTE}><Chargement /></div>
      ) : (
        <>
          <div className={`${CARTE} px-4 py-3 flex items-center gap-3 flex-wrap`}
               style={{ borderLeft: '3px solid #006633' }}>
            <span className="text-sm font-bold text-iss-dark">
              {classe?.nom} · semaine {semaine?.numero}
            </span>
            {semaine && (
              <span className="text-xs text-iss-gray">
                du {new Date(semaine.date_debut).toLocaleDateString('fr-FR')}
                {' '}au {new Date(semaine.date_fin).toLocaleDateString('fr-FR')}
              </span>
            )}
            <Badge ton="neutre">{seances.length} séance{seances.length !== 1 ? 's' : ''}</Badge>
            {seances.some(s => s.origine === 'permutation') && (
              <Badge ton="violet">Contient des permutations</Badge>
            )}
          </div>

          {seances.length === 0 ? (
            <div className={CARTE}>
              <Vide texte="Aucune séance pour cette semaine — dupliquez la grille type depuis l'écran « Grille type »." />
            </div>
          ) : (
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
                          const contenu = seancesDeLaCase(j.id, c.id);
                          return (
                            <td key={c.id} style={STYLE_CELLULE}>
                              {contenu.length === 0 ? (
                                <CaseVide />
                              ) : (
                                <div className="space-y-1">
                                  {contenu.map(s => (
                                    <CarteSeance
                                      key={s.id}
                                      type={s.type_seance_libelle}
                                      matiere={s.matiere_code}
                                      intitule={s.matiere_intitule}
                                      prof={s.prof_nom}
                                      salle={s.salle_nom}
                                      sousGroupe={s.sous_groupe_libelle}
                                      annulee={s.annulee}
                                      permutee={s.origine === 'permutation'}
                                      profInitial={s.prof_initial_nom}
                                      onClick={() => setSeanceEditee(s)}
                                      actions={
                                        <>
                                          {/* Icônes nues de 11 px collées l'une
                                              à l'autre : on visait le dessin,
                                              pas une cible. */}
                                          <button onClick={() => setSeanceAppel(s)} title="Feuille d'appel"
                                                  className="p-1.5 rounded-lg bg-white shadow-sm border border-gray-200
                                                             text-iss-gray hover:bg-[#006633] hover:text-white
                                                             hover:border-[#006633] transition-colors">
                                            <UserX size={13} />
                                          </button>
                                          <button onClick={() => setPermutation(s)}
                                                  title="Permuter les enseignants"
                                                  className="p-1.5 rounded-lg bg-white shadow-sm border border-gray-200
                                                             text-iss-gray hover:bg-[#7c3aed] hover:text-white
                                                             hover:border-[#7c3aed] transition-colors">
                                            <Repeat size={13} />
                                          </button>
                                        </>
                                      }
                                    />
                                  ))}
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="px-4 py-2.5 border-t border-gray-100 flex items-center gap-3 flex-wrap">
                <span className="text-xs font-semibold text-iss-gray uppercase tracking-wide">Légende</span>
                {TYPES_SEANCE.map(t => {
                  const c = couleurType(t.value);
                  return (
                    <span key={t.value} className="inline-flex items-center gap-1.5 text-xs text-iss-gray">
                      <span style={{
                        width: 12, height: 12, borderRadius: 3,
                        background: c.bg, border: `1px solid ${c.border}`, display: 'inline-block',
                      }} />
                      {t.label}
                    </span>
                  );
                })}
                <span className="inline-flex items-center gap-1.5 text-xs text-iss-gray">
                  <span style={{
                    width: 12, height: 12, borderRadius: 3,
                    background: 'transparent', border: '1px solid #7c3aed', display: 'inline-block',
                  }} />
                  Permutée
                </span>
              </div>
            </div>
          )}
        </>
      )}

      {seanceEditee && (
        <ModaleEditionSeance
          seance={seanceEditee} profs={profs} salles={salles}
          onFerme={() => setSeanceEditee(null)}
          onFait={(m) => { setSeanceEditee(null); notifier(m); }}
        />
      )}

      {seanceAppel && (
        <ModaleAppel seance={seanceAppel}
                     onFerme={() => setSeanceAppel(null)}
                     onFait={(m) => { setSeanceAppel(null); notifier(m); }} />
      )}

      {permutation && (
        <ModalePermutation
          depart={permutation} candidats={candidats}
          onFerme={() => setPermutation(null)}
          onFait={(m) => { setPermutation(null); notifier(m); }}
        />
      )}

      <Toast message={toast} />
    </div>
  );
}

// ── Édition d'une séance (unitaire ou en lot) ────────────────────────────────
