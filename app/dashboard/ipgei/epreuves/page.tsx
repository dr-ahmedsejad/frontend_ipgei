'use client';

/**
 * Le calendrier des épreuves : DS, examens finals, rattrapages.
 *
 * Une épreuve n'est pas une séance, et c'est tout l'objet de cet écran. Sa
 * durée — 2h, 3h, 4h — ne tombe pas sur la grille de créneaux de 1h30 ; elle
 * convoque plusieurs classes à la fois, qu'on déclare ici une bonne fois pour
 * toutes ; et elle n'a ni salle ni enseignant. Chaque classe compose dans la
 * sienne, répartie plus tard sur les fiches, quand l'effectif et l'anonymat
 * sont connus ; le surveillant, lui, relève de la vacation.
 *
 * L'emploi du temps ne la contient donc pas : il l'affiche en surimpression et
 * neutralise les créneaux que son intervalle recouvre.
 */
import { useEffect, useMemo, useState } from 'react';
import { CalendarClock, Pencil, Plus, Trash2 } from 'lucide-react';

import { Modal } from '@/components/ui/Modal';
import { ConfirmModal } from '@/components/ConfirmModal';
import { useToast, ToastContainer } from '@/components/ui/Toast';
import { canAccess } from '@/lib/auth';
import { formatDate } from '@/lib/formatters';
import { messageLisible } from '@/lib/api';
import {
  useCalendrierEpreuves, useClassesSelect, useEpreuveMutations, useMatieresSelect,
  useSemestresAll, useSessions,
} from '@/lib/api/ipgei-hooks';
import type { EpreuveIPGEI, EpreuveInput, TypeEpreuve } from '@/types/ipgei';

import { anneeParDefaut } from '../_annee';
import {
  Badge, BTN_PRIMAIRE, BTN_SECONDAIRE, CARTE, Chargement, DEGRADE, EnTetePage,
  Erreur, INPUT, SELECT, Vide,
} from '../_ui';

/**
 * Les durées proposées, en minutes.
 *
 * Une liste plutôt qu'un champ libre : ce sont les seules durées pratiquées, et
 * les taper à la main invite à des 175 ou des 90 qui ne correspondent à rien.
 * « Autre » reste ouvert pour les cas que l'usage inventera.
 */
const DUREES = [
  { minutes: 60,  libelle: '1h' },
  { minutes: 90,  libelle: '1h30' },
  { minutes: 120, libelle: '2h' },
  { minutes: 180, libelle: '3h' },
  { minutes: 240, libelle: '4h' },
];

/**
 * Pendant TypeScript de `LIBELLES_EPREUVE` (backend, `core/types_seance.py`).
 * Les deux doivent bouger ensemble : le serveur nomme l'épreuve sur les fiches
 * et les PDF, cet écran la nomme au moment où on la déclare.
 */
const TYPES: { code: TypeEpreuve; libelle: string }[] = [
  { code: 'DS', libelle: 'Devoir surveillé' },
  { code: 'EF', libelle: 'Examen final' },
  { code: 'ER', libelle: 'Examen de rattrapage' },
];

const VIDE: EpreuveInput = {
  type_epreuve: 'DS', numero: 1, duree_minutes: 120,
  heure_debut: '08:00', classes: [], observations: '',
};

/** « 08h00 » à partir de « 08:00:00 ». */
function heure(brute: string | undefined) {
  return (brute ?? '').slice(0, 5).replace(':', 'h');
}

export default function CalendrierEpreuvesPage() {
  const toast    = useToast();
  const peutGerer = canAccess('ipgei_sessions');

  const [annee, setAnnee]         = useState(anneeParDefaut());
  const [semestreId, setSemestre] = useState<number | null>(null);
  const [modale, setModale]       = useState<'ajout' | 'edition' | null>(null);
  const [editee, setEditee]       = useState<EpreuveIPGEI | null>(null);
  const [aSupprimer, setSupprimer] = useState<EpreuveIPGEI | null>(null);
  const [form, setForm]           = useState<EpreuveInput>(VIDE);
  const [dureeLibre, setDureeLibre] = useState(false);

  const { data: semestres = [] } = useSemestresAll({ annee_universitaire: annee });
  const { data: sessions  = [] } = useSessions(annee);
  const { data: classes   = [] } = useClassesSelect({ annee_universitaire: annee });
  const { data: matieres  = [] } = useMatieresSelect({});

  // Le premier semestre de l'année sert de sélection par défaut : ouvrir sur
  // « aucun semestre » n'affiche rien et laisse croire que le calendrier est
  // vide.
  useEffect(() => {
    if (semestres.length === 0) { setSemestre(null); return; }
    if (semestreId && semestres.some(s => s.id === semestreId)) return;
    setSemestre(semestres[0].id);
  }, [semestres, semestreId]);

  const { data: epreuves = [], isLoading, error } = useCalendrierEpreuves(
    { session__semestre: semestreId ?? undefined },
    semestreId != null,
  );
  const { creer, modifier, supprimer } = useEpreuveMutations();

  const semestre = semestres.find(s => s.id === semestreId);

  /**
   * Les classes du niveau du semestre, seules candidates.
   *
   * Convoquer une MPSI à un examen de S3 n'a pas de sens, et la liste entière
   * — quatorze classes sur deux années — rend la case à cocher illisible.
   */
  const classesDuNiveau = useMemo(() => {
    if (!semestre) return classes;
    return classes.filter(c => semestre.niveaux.includes(c.niveau));
  }, [classes, semestre]);

  /** Les matières du semestre : celles qu'on peut réellement faire composer. */
  const matieresDuSemestre = useMemo(() => {
    if (!semestre) return matieres;
    return matieres.filter(m => m.code_semestre === semestre.code);
  }, [matieres, semestre]);

  /**
   * La campagne où ranger l'épreuve. Un rattrapage appartient à la session de
   * rattrapage, tout le reste à la normale — c'est ce qui distingue les deux,
   * et le déduire du type évite de le redemander.
   */
  const sessionPour = (type: TypeEpreuve | undefined) => {
    const voulue = type === 'ER' ? 'rattrapage' : 'normale';
    return sessions.find(s => s.semestre === semestreId && s.type_session === voulue);
  };

  const ouvrirAjout = () => {
    setEditee(null);
    setForm({ ...VIDE, date: '', matiere: undefined });
    setDureeLibre(false);
    setModale('ajout');
  };

  const ouvrirEdition = (e: EpreuveIPGEI) => {
    setEditee(e);
    setForm({
      matiere: e.matiere, type_epreuve: e.type_epreuve, numero: e.numero,
      date: e.date, heure_debut: e.heure_debut.slice(0, 5),
      duree_minutes: e.duree_minutes, classes: [...e.classes],
      observations: e.observations,
    });
    setDureeLibre(!DUREES.some(d => d.minutes === e.duree_minutes));
    setModale('edition');
  };

  const enregistrer = async () => {
    if (!form.matiere)            { toast.error('La matière est requise.');  return; }
    if (!form.date)               { toast.error('La date est requise.');     return; }
    if (!form.heure_debut)        { toast.error("L'heure de début est requise."); return; }
    if (!form.classes?.length)    { toast.error('Convoquez au moins une classe.'); return; }

    const session = sessionPour(form.type_epreuve as TypeEpreuve);
    if (!session) {
      toast.error("Aucune campagne de saisie n'existe pour ce semestre. "
                  + 'Ouvrez-la depuis « Sessions de saisie ».');
      return;
    }

    try {
      if (editee) {
        await modifier.mutateAsync({ id: editee.id, input: { ...form, session: session.id } });
        toast.success('Épreuve mise à jour.');
      } else {
        await creer.mutateAsync({ ...form, session: session.id });
        toast.success('Épreuve programmée.');
      }
      setModale(null);
    } catch (e) {
      toast.error(messageLisible(e));
    }
  };

  const confirmerSuppression = async () => {
    if (!aSupprimer) return;
    try {
      await supprimer.mutateAsync(aSupprimer.id);
      toast.success('Épreuve retirée du calendrier.');
    } catch (e) {
      toast.error(messageLisible(e));
    } finally {
      setSupprimer(null);
    }
  };

  const basculerClasse = (id: number) => setForm(f => {
    const actuelles = f.classes ?? [];
    return {
      ...f,
      classes: actuelles.includes(id)
        ? actuelles.filter(x => x !== id)
        : [...actuelles, id],
    };
  });

  const enCours = creer.isPending || modifier.isPending;

  return (
    <div className="space-y-5 p-2">
      <ToastContainer toasts={toast.toasts} onClose={toast.removeToast} />

      <EnTetePage
        icone={<CalendarClock size={15} className="text-white" />}
        titre="Calendrier des épreuves"
        sousTitre={
          "Devoirs surveillés, examens finals et rattrapages. Déclarés une fois "
          + "pour toutes les classes convoquées ; l'emploi du temps les affiche "
          + 'et neutralise les créneaux qu\'ils recouvrent.'
        }
        actions={peutGerer && (
          <button onClick={ouvrirAjout} className={BTN_PRIMAIRE}
                  style={{ background: DEGRADE }} disabled={!semestreId}>
            <Plus size={14} /> Programmer une épreuve
          </button>
        )}
      />

      <div className={`${CARTE} p-4 flex items-end gap-3 flex-wrap`}>
        <div className="min-w-[160px]">
          <label className="block text-xs font-semibold text-iss-gray mb-1">
            Année universitaire
          </label>
          <input value={annee} onChange={e => setAnnee(e.target.value)}
                 className={INPUT} placeholder="2025-2026" />
        </div>
        <div className="min-w-[220px]">
          <label className="block text-xs font-semibold text-iss-gray mb-1">Semestre</label>
          <select value={semestreId ?? ''} className={SELECT}
                  onChange={e => setSemestre(e.target.value ? Number(e.target.value) : null)}>
            <option value="">—</option>
            {semestres.map(s => (
              <option key={s.id} value={s.id}>
                {s.code} — {s.niveaux.join(', ')}
              </option>
            ))}
          </select>
        </div>
      </div>

      <Erreur erreur={error} />

      {isLoading ? (
        <div className={CARTE}><Chargement /></div>
      ) : epreuves.length === 0 ? (
        <div className={CARTE}>
          <Vide texte={semestreId
            ? 'Aucune épreuve programmée sur ce semestre.'
            : 'Choisissez un semestre pour afficher son calendrier.'} />
        </div>
      ) : (
        <div className={`${CARTE} overflow-hidden`}>
          <div style={{ overflowX: 'auto' }}>
            <table className="w-full text-sm" style={{ minWidth: 820 }}>
              <thead>
                <tr className="text-left text-xs font-semibold text-iss-gray uppercase
                               tracking-wide border-b border-gray-100">
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Horaire</th>
                  <th className="px-4 py-3">Épreuve</th>
                  <th className="px-4 py-3">Matière</th>
                  <th className="px-4 py-3">Classes convoquées</th>
                  {peutGerer && <th className="px-4 py-3 w-24" />}
                </tr>
              </thead>
              <tbody>
                {epreuves.map(e => (
                  <tr key={e.id} className="border-b border-gray-50 last:border-0
                                            hover:bg-gray-50/60 transition-colors">
                    <td className="px-4 py-3 font-semibold text-iss-dark whitespace-nowrap">
                      {formatDate(e.date)}
                    </td>
                    <td className="px-4 py-3 tabular-nums whitespace-nowrap">
                      {heure(e.heure_debut)} → {heure(e.heure_fin)}
                      <span className="text-iss-gray"> · {e.duree_libelle}</span>
                    </td>
                    <td className="px-4 py-3">
                      <Badge ton="rouge">{e.type_epreuve} {e.numero}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-semibold">{e.matiere_code}</span>
                      <span className="text-iss-gray"> — {e.matiere_intitule}</span>
                    </td>
                    <td className="px-4 py-3 text-iss-gray">
                      {e.classes_noms.join(', ') || '—'}
                    </td>
                    {peutGerer && (
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button onClick={() => ouvrirEdition(e)} title="Modifier"
                                  className="p-1.5 rounded-lg text-iss-gray hover:bg-gray-100
                                             hover:text-iss-dark transition-colors">
                            <Pencil size={14} />
                          </button>
                          <button onClick={() => setSupprimer(e)} title="Retirer"
                                  className="p-1.5 rounded-lg text-iss-gray hover:bg-red-50
                                             hover:text-red-600 transition-colors">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal open={modale !== null} onClose={() => setModale(null)} maxWidth="max-w-2xl"
             title={editee ? 'Modifier une épreuve' : 'Programmer une épreuve'}>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-iss-gray mb-1">
                Type <span className="text-red-500">*</span>
              </label>
              <select value={form.type_epreuve ?? 'DS'} className={SELECT}
                      onChange={e => setForm(f => ({
                        ...f, type_epreuve: e.target.value as TypeEpreuve }))}>
                {TYPES.map(t => (
                  <option key={t.code} value={t.code}>{t.libelle}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-iss-gray mb-1">
                Numéro
              </label>
              <input type="number" min={1} value={form.numero ?? 1} className={INPUT}
                     onChange={e => setForm(f => ({
                       ...f, numero: Number(e.target.value) || 1 }))} />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-iss-gray mb-1">
              Matière <span className="text-red-500">*</span>
            </label>
            <select value={form.matiere ?? ''} className={SELECT}
                    onChange={e => setForm(f => ({
                      ...f, matiere: e.target.value ? Number(e.target.value) : undefined }))}>
              <option value="">—</option>
              {matieresDuSemestre.map(m => (
                <option key={m.id} value={m.id}>{m.code} — {m.intitule}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-iss-gray mb-1">
                Date <span className="text-red-500">*</span>
              </label>
              <input type="date" value={form.date ?? ''} className={INPUT}
                     onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-iss-gray mb-1">
                Début <span className="text-red-500">*</span>
              </label>
              <input type="time" value={form.heure_debut ?? ''} className={INPUT}
                     onChange={e => setForm(f => ({ ...f, heure_debut: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-iss-gray mb-1">
                Durée <span className="text-red-500">*</span>
              </label>
              {dureeLibre ? (
                <div className="flex items-center gap-1">
                  <input type="number" min={15} max={480} step={15} className={INPUT}
                         value={form.duree_minutes ?? 120}
                         onChange={e => setForm(f => ({
                           ...f, duree_minutes: Number(e.target.value) || 0 }))} />
                  <span className="text-xs text-iss-gray shrink-0">min</span>
                </div>
              ) : (
                <select value={form.duree_minutes ?? 120} className={SELECT}
                        onChange={e => {
                          if (e.target.value === 'autre') { setDureeLibre(true); return; }
                          setForm(f => ({ ...f, duree_minutes: Number(e.target.value) }));
                        }}>
                  {DUREES.map(d => (
                    <option key={d.minutes} value={d.minutes}>{d.libelle}</option>
                  ))}
                  <option value="autre">Autre…</option>
                </select>
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-iss-gray mb-1">
              Classes convoquées <span className="text-red-500">*</span>
            </label>
            {classesDuNiveau.length === 0 ? (
              <p className="text-xs text-iss-gray italic">
                Aucune classe sur ce semestre.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {classesDuNiveau.map(c => {
                  const choisie = (form.classes ?? []).includes(c.id);
                  return (
                    <button key={c.id} type="button" onClick={() => basculerClasse(c.id)}
                            className="px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all"
                            style={choisie
                              ? { background: 'rgba(0,102,51,0.08)', borderColor: '#006633',
                                  color: '#006633' }
                              : { background: 'white', borderColor: '#e5e7eb', color: '#6b7280' }}>
                      {c.nom}
                    </button>
                  );
                })}
              </div>
            )}
            {/* Le rappel qui justifie l'absence de champ « salle » : la
                répartition en salles se fait ailleurs, plus tard. */}
            <p className="text-[11px] text-iss-gray italic mt-2">
              Toutes composent à la même heure. La salle de chacune se décide sur
              les fiches de répartition, et la surveillance relève de la vacation.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-iss-gray mb-1">
              Observations
            </label>
            <input value={form.observations ?? ''} className={INPUT} maxLength={300}
                   placeholder="Documents autorisés, matériel…"
                   onChange={e => setForm(f => ({ ...f, observations: e.target.value }))} />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button onClick={() => setModale(null)} className={BTN_SECONDAIRE}>
              Annuler
            </button>
            <button onClick={enregistrer} disabled={enCours} className={BTN_PRIMAIRE}
                    style={{ background: DEGRADE }}>
              {enCours ? 'Enregistrement…' : editee ? 'Enregistrer' : 'Programmer'}
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmModal
        open={aSupprimer !== null}
        title="Retirer cette épreuve ?"
        message={aSupprimer
          ? `${aSupprimer.type_epreuve} ${aSupprimer.numero} de ${aSupprimer.matiere_code}, `
            + `le ${formatDate(aSupprimer.date)}. Les emplois du temps des classes `
            + `convoquées libéreront les créneaux qu'elle occupait. Les notes déjà `
            + `saisies ne sont pas touchées.`
          : ''}
        loading={supprimer.isPending}
        onConfirm={confirmerSuppression}
        onCancel={() => setSupprimer(null)}
      />
    </div>
  );
}
