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

/** Ce que la synchronisation du calendrier a fait, côté serveur. */
interface BilanCalendrier {
  creees:     number;
  modifiees:  number;
  supprimees: number;
  /** Semaines retirées du socle mais gardées ici : des séances s'y accrochent. */
  retenues:   number[];
  total:      number;
}

/**
 * Résume la synchronisation en une phrase.
 *
 * Trois mouvements peuvent s'être produits — des semaines créées, des dates
 * corrigées, des semaines retirées — et n'annoncer que les créations laissait
 * croire qu'une suppression n'avait rien fait.
 */
function resumeReprise(r: BilanCalendrier): string {
  const faits = [
    r.creees     && `${r.creees} reprise${r.creees > 1 ? 's' : ''}`,
    r.modifiees  && `${r.modifiees} corrigée${r.modifiees > 1 ? 's' : ''}`,
    r.supprimees && `${r.supprimees} retirée${r.supprimees > 1 ? 's' : ''}`,
  ].filter(Boolean);
  const garde = r.retenues?.length
    ? ` · semaine${r.retenues.length > 1 ? 's' : ''} ${r.retenues.join(', ')} gardée`
      + `${r.retenues.length > 1 ? 's' : ''} : des séances y sont rattachées`
    : '';
  return faits.length
    ? `${faits.join(', ')} — ${r.total} semaine(s) au total${garde}`
    : `Le semestre était déjà à jour${garde}`;
}

/** Date courte, jj/mm/aaaa. Rend un tiret sur une valeur absente. */
function jour(valeur: string | null | undefined): string {
  return valeur ? new Date(valeur).toLocaleDateString('fr-FR') : '—';
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
                {/* Le calendrier se CONSTATE : « 16 semaines · du 05/10 au
                    25/01 ». La dernière semaine n'est pas une fin — on peut en
                    ajouter d'autres après les seize, et la phrase suivra. Tant
                    qu'aucune n'est reprise, la date reste le repère de
                    convention posé à l'ouverture de l'année. */}
                <p className="text-xs text-iss-gray mt-0.5">
                  {s.niveaux.length > 0 && (
                    <>Suivi par {s.niveaux.join(', ')}{' · '}</>
                  )}
                  {s.nb_semaines_generees > 0 ? (
                    <>
                      <span className="font-semibold text-iss-dark">
                        {s.nb_semaines_generees} semaine{s.nb_semaines_generees > 1 ? 's' : ''}
                      </span>
                      {s.calendrier?.premiere_semaine && (
                        <> · du {jour(s.calendrier.premiere_semaine)}
                          {s.calendrier.derniere_semaine
                            && <> au {jour(s.calendrier.derniere_semaine)}</>}
                        </>
                      )}
                    </>
                  ) : (
                    <>à partir du {jour(s.date_debut)} · <span className="text-amber-700">
                      aucune semaine reprise</span></>
                  )}
                </p>
                <ChampDecalage semestre={s} mutation={mutations.update}
                               onNotifier={onNotifier} />
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
/**
 * Reprend du calendrier du socle les semaines qui manquent au semestre.
 *
 * Plus de compteur à côté du bouton : il affichait 16, partait au serveur, y
 * était validé entre 1 et 40 — et le service l'ignorait. On reprend TOUT ce
 * que porte le calendrier, qui fait foi ; en reprendre la moitié n'aurait pas
 * de sens.
 */
/**
 * Le DÉCALAGE DE RENTRÉE du semestre, en semaines.
 *
 * Il n'existe qu'un seul calendrier par parité : S1 et S3 reçoivent les mêmes
 * semaines, aux mêmes numéros. Quand une promotion entre plus tard — les MPSI
 * arrivés quatre semaines après les MP —, ses étudiants lisent « semaine 5 »
 * sur ce qui est leur première.
 *
 * Ce nombre recule l'AFFICHAGE. Le numéro en base ne bouge pas : c'est lui que
 * lisent le suivi et la paie, et c'est ce qui les garde justes.
 *
 * Réglé ici, sur le semestre, et non sur chaque classe : ce n'est pas une
 * propriété de « MPSI A » mais de la promotion. Le serveur le descend ensuite
 * sur tous les groupes du niveau — quinze saisies identiques seraient quinze
 * occasions d'en oublier une.
 */
function ChampDecalage({ semestre, mutation, onNotifier }: {
  semestre:   SemestreIPGEI;
  mutation:   { mutate: (v: { id: number; input: Partial<SemestreIPGEI> }, o?: object) => void };
  onNotifier: (m: string) => void;
}) {
  const [valeur, setValeur] = useState(String(semestre.decalage_semaines ?? 0));

  // À la sortie du champ, et non à chaque frappe : taper « 12 » enverrait
  // d'abord « 1 », et le serveur propagerait un décalage d'une semaine à tous
  // les groupes avant de se corriger.
  const enregistrer = () => {
    const n = Math.max(0, parseInt(valeur, 10) || 0);
    setValeur(String(n));
    if (n === (semestre.decalage_semaines ?? 0)) return;
    mutation.mutate({ id: semestre.id, input: { decalage_semaines: n } }, {
      onSuccess: () => onNotifier(n === 0
        ? `${semestre.code} : décalage retiré`
        : `${semestre.code} : rentrée décalée de ${n} semaine${n > 1 ? 's' : ''}`),
    });
  };

  return (
    <label className="mt-1 flex items-center gap-2 text-xs text-iss-gray">
      <span>Rentrée décalée de</span>
      <input type="number" min={0} max={20} value={valeur}
             onChange={e => setValeur(e.target.value)}
             onBlur={enregistrer}
             className="w-14 px-2 py-1 rounded-lg border border-gray-200 text-center
                        text-iss-dark tabular-nums focus:outline-none
                        focus:border-[#006633]" />
      <span>semaine{Number(valeur) > 1 ? 's' : ''}</span>
      {Number(valeur) > 0 && (
        <span className="text-[11px] text-iss-gray/70">
          — la semaine n°{Number(valeur) + 1} s'affichera « 1 »
        </span>
      )}
    </label>
  );
}


function BoutonReprise({ semestre, mutation, onNotifier }: {
  semestre:   SemestreIPGEI;
  mutation:   { mutate: (v: { id: number }, o?: object) => void; isPending: boolean };
  onNotifier: (m: string) => void;
}) {
  return (
    <button onClick={() => mutation.mutate(
              { id: semestre.id },
              { onSuccess: (r: BilanCalendrier) => onNotifier(resumeReprise(r)) },
            )}
            disabled={mutation.isPending}
            className={BTN_SECONDAIRE}
            title="Reprendre les semaines du calendrier (Paramètres → Semaines)">
      <RefreshCw size={13} /> Reprendre
    </button>
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
