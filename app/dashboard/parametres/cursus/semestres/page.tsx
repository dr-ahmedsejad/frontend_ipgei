'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, CalendarRange, Lock, Plus, RefreshCw, Trash2, Unlock, X,
} from 'lucide-react';

import { ConfirmModal } from '@/components/ConfirmModal';
import {
  BTN_PRIMAIRE, BTN_SECONDAIRE, Badge, CARTE, Chargement, DEGRADE,
  Erreur, INPUT, SELECT, Toast, Vide,
} from '@/app/dashboard/ipgei/_ui';
import { useAnneeIPGEI } from '@/app/dashboard/ipgei/_annee';
import { useSemestreMutations, useSemestres } from '@/lib/api/ipgei-hooks';
import { CODES_SEMESTRE, type CodeSemestre, type SemestreIPGEI } from '@/types/ipgei';

/** Retour au sommaire des paramètres — chaque écran est une page à part entière. */
function RetourParametres() {
  return (
    <Link href="/dashboard/parametres/cursus"
          className="inline-flex items-center gap-1.5 text-sm text-iss-gray hover:text-[#006633] transition-colors">
      <ArrowLeft size={14} /> Cursus prépa
    </Link>
  );
}

export default function ParametresSemestresPage() {
  const [toast, setToast] = useState<string | null>(null);
  const notifier = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2600); };

  return (
    <div className="space-y-5 max-w-5xl">
      <RetourParametres />
      <BlocSemestres onNotifier={notifier} />
      <Toast message={toast} />
    </div>
  );
}

function BlocSemestres({ onNotifier }: { onNotifier: (m: string) => void }) {
  const { annee, setAnnee, options } = useAnneeIPGEI();
  const { data, isLoading, error } = useSemestres({ annee_universitaire: annee || '__aucune__' });
  const mutations = useSemestreMutations();

  const [formOuvert, setFormOuvert] = useState(false);
  const [aSupprimer, setASupprimer] = useState<SemestreIPGEI | null>(null);

  const semestres = data?.results ?? [];

  return (
    <div className={CARTE}>
      <div className="flex items-center gap-3 px-5 pt-5 pb-3 flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <h2 className="text-sm font-bold text-iss-dark">Semestres et calendrier</h2>
          <p className="text-xs text-iss-gray">
            <strong>Ouvrir une année</strong> pose ses quatre semestres d&apos;un coup ; les
            inscrits reçoivent aussitôt les matières qui leur manquaient. Le calendrier,
            lui, se tient dans{' '}
            <Link href="/dashboard/parametres/semaines?retour=cursus"
                  className="font-semibold text-[#006633] hover:underline">
              Paramètres → Semaines
            </Link>
            {' '}— « Reprendre » en recopie ici les semaines pour que les séances puissent
            s&apos;y rattacher.
          </p>
        </div>
        <select value={annee} onChange={e => setAnnee(e.target.value)} className={SELECT} style={{ width: 140 }}>
          {options.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        {/* Ouvrir l'année d'un coup plutôt que quatre saisies : c'est en les
            créant un par un qu'une année restait à moitié ouverte, et ses
            inscrits avec la moitié de leurs matières. */}
        <button onClick={() => mutations.creerAnnee.mutate(annee, {
                  onSuccess: (r) => onNotifier(
                    r.semestres_crees
                      ? `${r.semestres_crees} semestre(s) créé(s) : ${r.codes.join(', ')}`
                      : `Les semestres de ${annee} existent déjà`,
                  ),
                })}
                disabled={mutations.creerAnnee.isPending}
                className={BTN_PRIMAIRE} style={{ background: DEGRADE }}>
          <CalendarRange size={14} />
          {mutations.creerAnnee.isPending ? 'Création…' : `Ouvrir ${annee}`}
        </button>
        <button onClick={() => setFormOuvert(true)} className={BTN_SECONDAIRE}>
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
            <div key={s.id} className="flex items-center gap-3 px-5 py-3.5 flex-wrap">
              <div className="flex-1 min-w-[220px]">
                {/* L'année d'étude, pas un niveau : S1 est celui de toute la
                    première année. Les niveaux qui la composent sont listés
                    ensuite — ils changent quand on en ouvre un nouveau. */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-bold text-iss-dark">{s.code}</span>
                  <Badge ton={s.rang === 1 ? 'bleu' : 'violet'}>{s.libelle_annee}</Badge>
                  <Badge ton="neutre">{s.type_semestre === 'I' ? 'Impair' : 'Pair'}</Badge>
                  {s.est_cloture && <Badge ton="ambre">Clôturé</Badge>}
                </div>
                <p className="text-xs text-iss-gray mt-0.5">
                  {s.niveaux.length > 0 && (
                    <>Suivi par {s.niveaux.join(', ')}{' · '}</>
                  )}
                  à partir du {new Date(s.date_debut).toLocaleDateString('fr-FR')}
                  {' · '}
                  <span className="font-semibold text-iss-dark">
                    {s.nb_semaines_generees} semaine(s) reprises
                  </span>
                </p>
              </div>

              <BoutonReprise semestre={s} mutation={mutations.genererSemaines}
                             onNotifier={onNotifier} />

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

/**
 * Recopie dans le semestre les semaines du calendrier commun.
 *
 * Le calendrier ne se modifie pas ici : cette reprise ne fait qu'y puiser, et
 * relancer n'ajoute que ce qui manquait. Sans elle, les séances de l'emploi du
 * temps n'auraient aucune semaine à quoi se rattacher.
 */
function BoutonReprise({ semestre, mutation, onNotifier }: {
  semestre:   SemestreIPGEI;
  mutation:   { mutate: (v: { id: number; nb?: number }, o?: object) => void; isPending: boolean };
  onNotifier: (m: string) => void;
}) {
  const [nb, setNb] = useState(String(semestre.nb_semaines || 16));

  return (
    <div className="flex items-center gap-1.5">
      <input type="number" min={1} max={40} value={nb}
             onChange={e => setNb(e.target.value)}
             title="Nombre de semaines à reprendre au maximum"
             className={INPUT} style={{ width: 62, textAlign: 'center' }} />
      <button onClick={() => mutation.mutate(
                { id: semestre.id, nb: Number(nb) || undefined },
                { onSuccess: (r: { semaines_creees: number; total: number }) =>
                    onNotifier(r.semaines_creees
                      ? `${r.semaines_creees} semaine(s) reprises — ${r.total} au total`
                      : 'Le semestre était déjà à jour') },
              )}
              disabled={mutation.isPending}
              className={BTN_SECONDAIRE} title="Reprendre les semaines du calendrier">
        <RefreshCw size={13} /> Reprendre
      </button>
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

      <div className="grid gap-3 sm:grid-cols-2">
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
          <p className="text-xs text-iss-gray mt-1">
            Les semaines se reprennent ensuite du calendrier commun.
          </p>
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
