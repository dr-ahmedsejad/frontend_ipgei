'use client';

import { useMemo, useState } from 'react';
import {
  CalendarClock, CheckCircle2, Lock, LockOpen, ShieldAlert, Sliders, Timer,
} from 'lucide-react';

import {
  BTN_PRIMAIRE, BTN_SECONDAIRE, Badge, CARTE, Chargement, DEGRADE, EnTetePage,
  Erreur, INPUT, SELECT, Toast, Vide, fmtNote, type TonBadge,
} from '../../_ui';
import { useAnneeIPGEI } from '../../_annee';
import { useSessionMutations, useSessions } from '@/lib/api/ipgei-hooks';
import type { EtatSessionIPGEI, SessionEvaluationIPGEI } from '@/types/ipgei';

const TONS: Record<EtatSessionIPGEI, TonBadge> = {
  ouverte: 'vert',
  fermee:  'neutre',
  close:   'ambre',
};

const LIBELLES: Record<EtatSessionIPGEI, string> = {
  ouverte: 'Ouverte — saisie en cours',
  fermee:  'Pas encore ouverte',
  close:   'Clôturée',
};

/**
 * Fenêtres de saisie des notes.
 *
 * Le semestre porte un verrou d'un seul tenant (`est_cloture`) : il fermait la
 * saisie du rattrapage en même temps que celle des DS, alors qu'un rattrapage
 * se saisit après l'arrêt des notes normales. Les deux campagnes s'ouvrent et
 * se ferment désormais séparément, depuis cet écran.
 */
export default function SessionsSaisiePage() {
  const { annee, setAnnee, options } = useAnneeIPGEI();
  const { data: sessions = [], isLoading, error } = useSessions(annee);
  const { ouvrir, cloturer, rouvrir, plafond } = useSessionMutations();

  const [message, setMessage]   = useState<string | null>(null);
  const [echec, setEchec]       = useState<string | null>(null);
  const [aPlafonner, setAPlafonner] = useState<SessionEvaluationIPGEI | null>(null);

  const notifier = (m: string) => { setMessage(m); setTimeout(() => setMessage(null), 2800); };
  const signaler = (e: unknown) => setEchec(e instanceof Error ? e.message : 'Erreur');

  /** Les deux campagnes d'un même semestre se lisent côte à côte. */
  const parSemestre = useMemo(() => {
    const groupes = new Map<number, SessionEvaluationIPGEI[]>();
    for (const session of sessions) {
      groupes.set(session.semestre, [...(groupes.get(session.semestre) ?? []), session]);
    }
    return [...groupes.values()].map(lot =>
      [...lot].sort(a => (a.type_session === 'normale' ? -1 : 1)),
    );
  }, [sessions]);

  const agir = (
    mutation: { mutate: (id: number, options?: object) => void },
    session: SessionEvaluationIPGEI,
    succes: string,
  ) => {
    setEchec(null);
    mutation.mutate(session.id, {
      onSuccess: () => notifier(succes),
      onError:   signaler,
    });
  };

  return (
    <div className="space-y-5">
      <Toast message={message} />

      <EnTetePage
        icone={<CalendarClock size={14} className="text-white" />}
        titre="Sessions de saisie"
        sousTitre="Ouverture et clôture des campagnes de notes, semestre par semestre."
        actions={
          <select value={annee} onChange={e => setAnnee(e.target.value)}
                  className={SELECT} style={{ maxWidth: 180 }}>
            {options.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        }
      />

      <Erreur erreur={error} />
      {echec && <Erreur erreur={new Error(echec)} />}

      {isLoading && !sessions.length ? (
        <div className={CARTE}><Chargement texte="Lecture des campagnes…" /></div>
      ) : !parSemestre.length ? (
        <div className={CARTE}>
          <Vide texte="Aucun semestre pour cette année — créez-les dans les paramètres du cursus." />
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {parSemestre.map(lot => (
            <div key={lot[0].semestre} className={`${CARTE} p-4 space-y-3`}>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-iss-dark">
                  {lot[0].semestre_code} — {lot[0].semestre_annee}
                </span>
                {lot[0].semestre_cloture && (
                  <Badge ton="rouge">
                    <Lock size={10} className="inline mr-1" />Semestre clôturé
                  </Badge>
                )}
              </div>

              {lot[0].semestre_cloture && (
                <p className="text-xs text-iss-gray">
                  Le semestre est clôturé : aucune campagne n&apos;accepte de note, même
                  ouverte. Rouvrez le semestre dans les paramètres du cursus.
                </p>
              )}

              {lot.map(session => (
                <CarteSession
                  key={session.id}
                  session={session}
                  normaleClose={lot.find(s => s.type_session === 'normale')?.est_close ?? false}
                  onOuvrir={() => agir(ouvrir, session, 'Campagne ouverte')}
                  onCloturer={() => agir(cloturer, session, 'Campagne clôturée')}
                  onRouvrir={() => agir(rouvrir, session, 'Campagne rouverte')}
                  onPlafond={() => { setEchec(null); setAPlafonner(session); }}
                  enCours={ouvrir.isPending || cloturer.isPending || rouvrir.isPending}
                />
              ))}
            </div>
          ))}
        </div>
      )}

      {aPlafonner && (
        <ModalePlafond
          session={aPlafonner}
          enCours={plafond.isPending}
          onFermer={() => setAPlafonner(null)}
          onValider={(valeur) => {
            setEchec(null);
            plafond.mutate({ id: aPlafonner.id, valeur }, {
              onSuccess: (r) => {
                notifier(`Plafond enregistré · ${r.notes_recalculees} note(s) recalculée(s)`);
                setAPlafonner(null);
              },
              onError: signaler,
            });
          }}
        />
      )}
    </div>
  );
}

function CarteSession({
  session, normaleClose, onOuvrir, onCloturer, onRouvrir, onPlafond, enCours,
}: {
  session:      SessionEvaluationIPGEI;
  normaleClose: boolean;
  onOuvrir:     () => void;
  onCloturer:   () => void;
  onRouvrir:    () => void;
  onPlafond:    () => void;
  enCours:      boolean;
}) {
  const rattrapage = session.type_session === 'rattrapage';
  // Ouvrir le rattrapage avant l'arrêt des moyennes n'a pas de sens : le
  // backend le refuse, autant l'expliquer ici plutôt que de laisser cliquer.
  const attendLaNormale = rattrapage && !normaleClose && session.etat === 'fermee';

  return (
    <div className="rounded-xl border border-gray-100 p-3 space-y-2"
         style={{ borderLeft: `3px solid ${session.est_saisissable ? '#006633' : '#e5e7eb'}` }}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-semibold text-iss-dark">
          {session.type_session_display}
        </span>
        <Badge ton={TONS[session.etat]}>{LIBELLES[session.etat]}</Badge>
        {session.etat === 'ouverte' && !session.est_saisissable && (
          <Badge ton="rouge">Bloquée par le semestre</Badge>
        )}
        {rattrapage && (
          <Badge ton="bleu">
            Plafond {session.plafond_rattrapage ? fmtNote(session.plafond_rattrapage) : 'aucun'}
          </Badge>
        )}
      </div>

      <p className="text-xs text-iss-gray">
        {session.etat === 'close' && session.cloturee_le
          ? <>Clôturée le {session.cloturee_le.slice(0, 10)}
              {session.cloturee_par_nom && <> par {session.cloturee_par_nom}</>}.</>
          : session.etat === 'ouverte' && session.ouverte_le
          ? <>Ouverte depuis le {session.ouverte_le.slice(0, 10)}.</>
          : attendLaNormale
          ? 'S\'ouvrira une fois la session normale clôturée — un rattrapage suppose des moyennes arrêtées.'
          : 'Aucune saisie possible tant que la campagne n\'est pas ouverte.'}
      </p>

      <div className="flex gap-2 flex-wrap">
        {session.etat === 'fermee' && (
          <button onClick={onOuvrir} disabled={enCours || attendLaNormale || session.semestre_cloture}
                  className={BTN_PRIMAIRE} style={{ background: DEGRADE }}>
            <LockOpen size={13} /> Ouvrir
          </button>
        )}
        {session.etat === 'ouverte' && (
          <button onClick={onCloturer} disabled={enCours} className={BTN_SECONDAIRE}>
            <CheckCircle2 size={13} /> Clôturer
          </button>
        )}
        {session.etat === 'close' && (
          <button onClick={onRouvrir} disabled={enCours} className={BTN_SECONDAIRE}>
            <ShieldAlert size={13} /> Rouvrir (admin)
          </button>
        )}
        {rattrapage && session.etat !== 'close' && (
          <button onClick={onPlafond} className={BTN_SECONDAIRE}>
            <Sliders size={13} /> Plafond
          </button>
        )}
      </div>
    </div>
  );
}

function ModalePlafond({ session, enCours, onFermer, onValider }: {
  session:   SessionEvaluationIPGEI;
  enCours:   boolean;
  onFermer:  () => void;
  onValider: (valeur: string | null) => void;
}) {
  const [valeur, setValeur] = useState(session.plafond_rattrapage ?? '');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className={`${CARTE} p-6 w-full space-y-3`} style={{ maxWidth: 440 }}>
        <div className="flex items-center gap-2">
          <Timer size={16} className="text-iss-primary" />
          <h3 className="text-sm font-semibold text-iss-dark">
            Plafond de rattrapage — {session.semestre_code}
          </h3>
        </div>

        <p className="text-xs text-iss-gray">
          Note maximale qu&apos;un rattrapage peut rapporter. Laisser vide retire tout
          plafond. La valeur est figée sur la campagne : changer le paramétrage du
          cursus plus tard ne modifiera plus ces notes.
        </p>

        <input value={valeur} onChange={e => setValeur(e.target.value)}
               inputMode="decimal" placeholder="ex. 10" className={INPUT} />

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onFermer} className={BTN_SECONDAIRE}>Annuler</button>
          <button onClick={() => onValider(valeur.trim() === '' ? null : valeur.trim())}
                  disabled={enCours} className={BTN_PRIMAIRE} style={{ background: DEGRADE }}>
            {enCours ? 'Enregistrement…' : 'Enregistrer et recalculer'}
          </button>
        </div>
      </div>
    </div>
  );
}
