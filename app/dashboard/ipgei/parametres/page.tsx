'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarRange, Lock, Plus, RefreshCw, Settings, Trash2, Unlock, X,
} from 'lucide-react';

import { ConfirmModal } from '@/components/ConfirmModal';
import {
  BTN_PRIMAIRE, BTN_SECONDAIRE, Badge, CARTE, Chargement, DEGRADE, EnTetePage,
  Erreur, INPUT, SELECT, Toast, Vide,
} from '../_ui';
import { useAnneeIPGEI } from '../_annee';
import {
  useParametresIPGEI, useParametresIPGEIMutation, useSemaineMutation,
  useSemaines, useSemestreMutations, useSemestres,
} from '@/lib/api/ipgei-hooks';
import { creneauxApi } from '@/lib/api/creneaux';
import { CODES_SEMESTRE, type CodeSemestre, type SemestreIPGEI } from '@/types/ipgei';

const TYPES_SEMAINE = [
  { value: 'cours',    label: 'Cours' },
  { value: 'examen',   label: 'Examens' },
  { value: 'vacances', label: 'Vacances' },
  { value: 'ferie',    label: 'Férié' },
];

export default function ParametresIPGEIPage() {
  const [toast, setToast] = useState<string | null>(null);
  const notifier = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2800); };

  return (
    <div className="space-y-5 max-w-5xl">
      <EnTetePage
        icone={<Settings size={14} className="text-white" />}
        titre="Paramètres du cursus"
        sousTitre="Seuil de délibération, rattrapage, calendrier des semestres et des semaines."
      />

      <BlocParametres onNotifier={notifier} />
      <BlocCreneaux onNotifier={notifier} />
      <BlocSemestres onNotifier={notifier} />

      <Toast message={toast} />
    </div>
  );
}

// ── Grille horaire : durée saisie par créneau ────────────────────────────────
function BlocCreneaux({ onNotifier }: { onNotifier: (m: string) => void }) {
  const qc = useQueryClient();
  const { data: creneaux = [], isLoading, error } = useQuery({
    queryKey: ['ipgei', 'ref', 'creneaux'],
    queryFn:  () => creneauxApi.actifs(),
  });

  const [durees, setDurees] = useState<Record<number, string>>({});
  const [erreur, setErreur] = useState<string | null>(null);

  const majDuree = useMutation({
    mutationFn: ({ id, duree }: { id: number; duree: number }) => creneauxApi.setDuree(id, duree),
    onSuccess:  (c) => {
      qc.invalidateQueries({ queryKey: ['ipgei', 'ref', 'creneaux'] });
      onNotifier(`Durée de ${c.creneau} enregistrée`);
    },
    onError: (e) => setErreur(e instanceof Error ? e.message : 'Erreur'),
  });

  /** Enregistre à la sortie du champ, et seulement si la valeur a changé. */
  const valider = (id: number, initiale: number) => {
    const saisie = durees[id];
    if (saisie === undefined) return;
    const valeur = Number(saisie.replace(',', '.'));
    if (!Number.isFinite(valeur) || valeur <= 0) {
      setErreur("La durée doit être un nombre d'heures positif (ex. 1.5 pour 1h30).");
      return;
    }
    setErreur(null);
    if (valeur !== initiale) majDuree.mutate({ id, duree: valeur });
  };

  return (
    <div className={`${CARTE} p-5`}>
      <h2 className="text-sm font-bold text-iss-dark mb-1">Grille horaire</h2>
      <p className="text-xs text-iss-gray mb-4">
        Les créneaux sont repris de SIGA et ne se modifient pas ici. Seule la
        <strong> durée se saisit, créneau par créneau</strong> — c&apos;est elle qui sert de
        base au calcul de la charge d&apos;enseignement.
      </p>

      <Erreur erreur={error} />
      {erreur && <p className="mb-3 text-sm text-red-600">{erreur}</p>}

      {isLoading ? <Chargement /> : creneaux.length === 0 ? (
        <Vide texte="Aucun créneau actif. Lancez `manage.py sync_creneaux_siga` pour reprendre ceux de SIGA." />
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {creneaux.map(c => (
            <div key={c.id}
                 className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-gray-100 bg-gray-50">
              <span className="text-xs font-bold text-iss-gray w-4">{c.ordre}</span>
              <span className="text-sm font-semibold text-iss-dark flex-1 whitespace-nowrap">
                {c.creneau}
              </span>
              <input
                type="number" min="0.25" step="0.25"
                value={durees[c.id] ?? String(c.duree)}
                onChange={e => setDurees(d => ({ ...d, [c.id]: e.target.value }))}
                onBlur={() => valider(c.id, c.duree)}
                onKeyDown={e => e.key === 'Enter' && e.currentTarget.blur()}
                className="w-16 px-2 py-1.5 rounded-lg border border-gray-200 text-sm text-center
                           bg-white focus:outline-none focus:border-[#006633] transition-all"
              />
              <span className="text-xs text-iss-gray">h</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Réglages institutionnels ─────────────────────────────────────────────────
function BlocParametres({ onNotifier }: { onNotifier: (m: string) => void }) {
  const { data, isLoading, error } = useParametresIPGEI();
  const mutation = useParametresIPGEIMutation();

  const [seuil, setSeuil]       = useState('');
  const [plafond, setPlafond]   = useState('');
  const [semaines, setSemaines] = useState('');
  const [redoublement, setRedoublement] = useState('');
  const [erreur, setErreur]     = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    setSeuil(data.seuil_validation);
    setPlafond(data.plafond_rattrapage ?? '');
    setSemaines(String(data.nb_semaines_defaut));
    setRedoublement(String(data.droit_redoublement_max));
  }, [data]);

  const enregistrer = () => {
    setErreur(null);
    mutation.mutate(
      {
        seuil_validation:   seuil,
        // Champ vide = pas de plafond : le rattrapage vaut alors pleinement.
        plafond_rattrapage: plafond.trim() === '' ? null : plafond,
        nb_semaines_defaut: Number(semaines) || 16,
        droit_redoublement_max: Number(redoublement) || 0,
      },
      {
        onSuccess: () => onNotifier('Paramètres enregistrés'),
        onError:   (e) => setErreur(e instanceof Error ? e.message : 'Erreur'),
      },
    );
  };

  if (isLoading) return <div className={CARTE}><Chargement /></div>;

  return (
    <div className={`${CARTE} p-5`}>
      <h2 className="text-sm font-bold text-iss-dark mb-1">Règles de scolarité</h2>
      <p className="text-xs text-iss-gray mb-4">
        Ces valeurs servent de <strong>défaut</strong> : chaque délibération fige son propre
        seuil et son propre plafond à sa création, si bien qu&apos;un changement ici ne
        réécrit jamais un jury déjà tenu.
      </p>

      <Erreur erreur={error} />

      <div className="grid gap-4 sm:grid-cols-4">
        <div>
          <label className="block text-xs font-semibold text-iss-dark mb-1.5">
            Seuil de validation
          </label>
          <input type="number" min="0" max="20" step="0.25" value={seuil} className={INPUT}
                 onChange={e => setSeuil(e.target.value)} />
          <p className="text-xs text-iss-gray mt-1">Moyenne d&apos;admission / d&apos;autorisation CNIM.</p>
        </div>
        <div>
          <label className="block text-xs font-semibold text-iss-dark mb-1.5">
            Plafond de rattrapage
          </label>
          <input type="number" min="0" max="20" step="0.25" value={plafond} className={INPUT}
                 placeholder="Aucun plafond" onChange={e => setPlafond(e.target.value)} />
          <p className="text-xs text-iss-gray mt-1">Vide = le rattrapage compte sans limite.</p>
        </div>
        <div>
          <label className="block text-xs font-semibold text-iss-dark mb-1.5">
            Semaines par semestre
          </label>
          <input type="number" min="1" max="40" value={semaines} className={INPUT}
                 onChange={e => setSemaines(e.target.value)} />
          <p className="text-xs text-iss-gray mt-1">Proposé à la création d&apos;un semestre.</p>
        </div>
        <div>
          <label className="block text-xs font-semibold text-iss-dark mb-1.5">
            Redoublements autorisés
          </label>
          <input type="number" min="0" max="3" value={redoublement} className={INPUT}
                 onChange={e => setRedoublement(e.target.value)} />
          <p className="text-xs text-iss-gray mt-1">En MP. Au-delà, la décision devient l&apos;exclusion.</p>
        </div>
      </div>

      {erreur && <p className="mt-3 text-sm text-red-600">{erreur}</p>}

      <button onClick={enregistrer} disabled={mutation.isPending}
              className={`${BTN_PRIMAIRE} mt-5`} style={{ background: DEGRADE }}>
        Enregistrer
      </button>
    </div>
  );
}

// ── Semestres et semaines ────────────────────────────────────────────────────
/**
 * Ajout de semaines à un semestre.
 *
 * Le nombre est saisi plutôt que déduit d'une date de fin : personne ne connaît
 * en septembre la date exacte du dernier cours, et un report d'examens ou une
 * semaine de rattrapage rendrait cette date fausse. On en ajoute quand on en a
 * besoin, autant de fois que nécessaire.
 */
function AjoutSemaines({ semestre, mutation, onNotifier }: {
  semestre:  SemestreIPGEI;
  mutation:  { mutate: (v: { id: number; nb?: number }, o?: object) => void; isPending: boolean };
  onNotifier: (m: string) => void;
}) {
  const [nb, setNb] = useState(String(semestre.nb_semaines || 16));

  return (
    <div className="flex items-center gap-1.5">
      <input type="number" min={1} max={40} value={nb}
             onChange={e => setNb(e.target.value)}
             title="Nombre de semaines à ajouter"
             className={INPUT} style={{ width: 62, textAlign: 'center' }} />
      <button onClick={() => mutation.mutate(
                { id: semestre.id, nb: Number(nb) || undefined },
                { onSuccess: (r: { semaines_creees: number; total: number }) =>
                    onNotifier(`${r.semaines_creees} semaine(s) ajoutée(s) — ${r.total} au total`) },
              )}
              disabled={mutation.isPending}
              className={BTN_SECONDAIRE}>
        <RefreshCw size={13} /> Ajouter des semaines
      </button>
    </div>
  );
}


function BlocSemestres({ onNotifier }: { onNotifier: (m: string) => void }) {
  const { annee, setAnnee, options } = useAnneeIPGEI();
  const { data, isLoading, error } = useSemestres({ annee_universitaire: annee || '__aucune__' });
  const mutations = useSemestreMutations();

  const [formOuvert, setFormOuvert] = useState(false);
  const [ouvert, setOuvert]         = useState<number | null>(null);
  const [aSupprimer, setASupprimer] = useState<SemestreIPGEI | null>(null);

  const semestres = data?.results ?? [];

  return (
    <div className={CARTE}>
      <div className="flex items-center gap-3 px-5 pt-5 pb-3 flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <h2 className="text-sm font-bold text-iss-dark">Semestres et calendrier</h2>
          <p className="text-xs text-iss-gray">
            Les dates pilotent la génération des semaines, base de l&apos;emploi du temps hebdomadaire.
          </p>
        </div>
        <select value={annee} onChange={e => setAnnee(e.target.value)} className={SELECT} style={{ width: 140 }}>
          {options.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <button onClick={() => setFormOuvert(true)} className={BTN_PRIMAIRE} style={{ background: DEGRADE }}>
          <Plus size={14} /> Ajouter
        </button>
      </div>

      <Erreur erreur={error} />

      {formOuvert && (
        <div className="px-5 pb-4">
          <FormulaireSemestre annee={annee} create={mutations.create}
                              onFerme={() => setFormOuvert(false)}
                              onCree={() => { setFormOuvert(false); onNotifier('Semestre créé'); }} />
        </div>
      )}

      {isLoading && !data ? <Chargement /> : semestres.length === 0 ? (
        <Vide texte={`Aucun semestre pour ${annee}.`} />
      ) : (
        <div className="divide-y divide-gray-100 border-t border-gray-100">
          {semestres.map(s => (
            <div key={s.id}>
              <div className="flex items-center gap-3 px-5 py-3.5 flex-wrap">
                <div className="flex-1 min-w-[220px]">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold text-iss-dark">{s.code}</span>
                    <Badge ton={s.niveau === 'MPSI' ? 'bleu' : 'violet'}>{s.niveau}</Badge>
                    <Badge ton="neutre">{s.type_semestre === 'I' ? 'Impair' : 'Pair'}</Badge>
                    {s.est_cloture && <Badge ton="ambre">Clôturé</Badge>}
                  </div>
                  <p className="text-xs text-iss-gray mt-0.5">
                    à partir du {new Date(s.date_debut).toLocaleDateString('fr-FR')}
                    {' · '}
                    <span className="font-semibold text-iss-dark">
                      {s.nb_semaines_generees} semaine(s) au calendrier
                    </span>
                  </p>
                </div>

                {/* Le calendrier fait foi : on ajoute des semaines au fil de
                    l'année plutôt que de figer une période à l'avance. */}
                <AjoutSemaines semestre={s} mutation={mutations.genererSemaines}
                               onNotifier={onNotifier} />

                <button onClick={() => setOuvert(o => (o === s.id ? null : s.id))}
                        className={BTN_SECONDAIRE}>
                  <CalendarRange size={13} /> {ouvert === s.id ? 'Masquer' : 'Voir'} le calendrier
                </button>

                <button onClick={() => mutations.cloturer.mutate(s.id, {
                          onSuccess: () => onNotifier(s.est_cloture ? 'Semestre rouvert' : 'Semestre clôturé'),
                        })}
                        title={s.est_cloture ? 'Rouvrir la saisie' : 'Clôturer la saisie'}
                        className="p-2 rounded-lg text-iss-gray hover:bg-gray-100 hover:text-[#006633] transition-colors">
                  {s.est_cloture ? <Unlock size={14} /> : <Lock size={14} />}
                </button>
                <button onClick={() => setASupprimer(s)} title="Supprimer"
                        className="p-2 rounded-lg text-iss-gray hover:bg-red-50 hover:text-red-600 transition-colors">
                  <Trash2 size={14} />
                </button>
              </div>

              {ouvert === s.id && <Calendrier semestre={s} onNotifier={onNotifier} />}
            </div>
          ))}
        </div>
      )}

      <ConfirmModal
        open={!!aSupprimer}
        title="Supprimer le semestre"
        message={aSupprimer
          ? `Supprimer ${aSupprimer.code} ${aSupprimer.annee_universitaire} ? Les semaines et les séances rattachées seront supprimées avec lui. Les notes liées bloquent l'opération.`
          : ''}
        onConfirm={() => aSupprimer && mutations.remove.mutate(aSupprimer.id, {
          onSuccess: () => { onNotifier('Semestre supprimé'); setASupprimer(null); },
          onError:   () => setASupprimer(null),
        })}
        onCancel={() => setASupprimer(null)}
        loading={mutations.remove.isPending}
      />
    </div>
  );
}

function Calendrier({
  semestre, onNotifier,
}: { semestre: SemestreIPGEI; onNotifier: (m: string) => void }) {
  const { data: semaines = [], isLoading } = useSemaines(semestre.id);
  const mutation = useSemaineMutation();

  if (isLoading) return <div className="bg-gray-50/60 px-5 py-3"><Chargement /></div>;

  if (semaines.length === 0) {
    return (
      <div className="bg-gray-50/60 px-5 py-4">
        <p className="text-xs text-iss-gray">
          Aucune semaine générée. Utilisez « Générer les semaines » pour découper la période
          en semaines calendaires.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-gray-50/60 px-5 py-4">
      <p className="text-xs text-iss-gray mb-3">
        Seules les semaines de type <strong>Cours</strong> sont numérotées et reçoivent
        la duplication de l&apos;emploi du temps.
      </p>
      <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
        {semaines.map(s => (
          <div key={s.id} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-gray-100">
            <span className="text-xs font-bold text-iss-dark w-9 shrink-0">
              {s.numero != null ? `S${s.numero}` : '—'}
            </span>
            <span className="text-xs text-iss-gray flex-1 whitespace-nowrap">
              {new Date(s.date_debut).toLocaleDateString('fr-FR')}
            </span>
            <select value={s.type_semaine} className={`${SELECT} text-xs py-1.5`} style={{ width: 110 }}
                    onChange={e => mutation.mutate(
                      { id: s.id, input: { type_semaine: e.target.value as never } },
                      { onSuccess: () => onNotifier('Semaine mise à jour') },
                    )}>
              {TYPES_SEMAINE.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
        ))}
      </div>
    </div>
  );
}

function FormulaireSemestre({
  annee, create, onFerme, onCree,
}: {
  annee: string;
  create: { mutate: (v: never, o?: object) => void; isPending: boolean };
  onFerme: () => void; onCree: () => void;
}) {
  const [code, setCode]           = useState<CodeSemestre>('S1');
  const [debut, setDebut]         = useState('');
  const [nbSemaines, setNbSemaines] = useState('16');
  const [erreur, setErreur]       = useState<string | null>(null);

  // Aucune date de fin n'est demandée : le semestre finit avec sa dernière
  // semaine générée, et on en ajoute autant qu'il en faut au fil de l'année.
  const enregistrer = () => {
    if (!debut) { setErreur('Renseignez la date de la première semaine.'); return; }
    setErreur(null);
    create.mutate(
      {
        code, annee_universitaire: annee,
        date_debut: debut,
        nb_semaines: Number(nbSemaines) || 16,
      } as never,
      { onSuccess: onCree, onError: (e: unknown) => setErreur(e instanceof Error ? e.message : 'Erreur') },
    );
  };

  return (
    <div className="p-4 rounded-xl border border-gray-200 bg-gray-50">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-iss-dark">Nouveau semestre — {annee}</h3>
        <button onClick={onFerme} className="p-1 rounded-lg text-iss-gray hover:bg-gray-100 transition-colors">
          <X size={14} />
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="block text-xs font-semibold text-iss-dark mb-1.5">Semestre</label>
          <select value={code} className={SELECT} onChange={e => setCode(e.target.value as CodeSemestre)}>
            {CODES_SEMESTRE.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-iss-dark mb-1.5">
            Première semaine
          </label>
          <input type="date" value={debut} className={INPUT} onChange={e => setDebut(e.target.value)} />
          <p className="text-xs text-iss-gray mt-1">Les suivantes en découlent.</p>
        </div>
        <div>
          <label className="block text-xs font-semibold text-iss-dark mb-1.5">
            Semaines à générer
          </label>
          <input type="number" min="1" max="40" value={nbSemaines} className={INPUT}
                 onChange={e => setNbSemaines(e.target.value)} />
          <p className="text-xs text-iss-gray mt-1">Vous pourrez en ajouter à tout moment.</p>
        </div>
      </div>

      {erreur && <p className="mt-3 text-sm text-red-600">{erreur}</p>}

      <div className="flex gap-2 mt-4">
        <button onClick={enregistrer} disabled={create.isPending}
                className={BTN_PRIMAIRE} style={{ background: DEGRADE }}>
          Créer
        </button>
        <button onClick={onFerme} className={BTN_SECONDAIRE}>Annuler</button>
      </div>
    </div>
  );
}
