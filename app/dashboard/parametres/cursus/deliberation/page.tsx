'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

import {
  BTN_PRIMAIRE, CARTE, Chargement, DEGRADE, Erreur, INPUT, Toast,
} from '@/app/dashboard/ipgei/_ui';
import { useParametresIPGEI, useParametresIPGEIMutation } from '@/lib/api/ipgei-hooks';

/** Retour au sommaire des paramètres — chaque écran est une page à part entière. */
function RetourParametres() {
  return (
    <Link href="/dashboard/parametres/cursus"
          className="inline-flex items-center gap-1.5 text-sm text-iss-gray hover:text-[#006633] transition-colors">
      <ArrowLeft size={14} /> Cursus prépa
    </Link>
  );
}

export default function ParametresCursusPage() {
  const [toast, setToast] = useState<string | null>(null);
  const notifier = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2600); };

  return (
    <div className="space-y-5 max-w-5xl">
      <RetourParametres />
      <BlocParametres onNotifier={notifier} />
      <Toast message={toast} />
    </div>
  );
}

function BlocParametres({ onNotifier }: { onNotifier: (m: string) => void }) {
  const { data, isLoading, error } = useParametresIPGEI();
  const mutation = useParametresIPGEIMutation();

  const [seuil, setSeuil]       = useState('');
  const [seuilSemestre, setSeuilSemestre] = useState('');
  const [plafond, setPlafond]   = useState('');
  const [semaines, setSemaines] = useState('');
  const [redoublement, setRedoublement] = useState('');
  const [erreur, setErreur]     = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    setSeuil(data.seuil_validation);
    setSeuilSemestre(data.seuil_validation_semestre ?? '');
    setPlafond(data.plafond_rattrapage ?? '');
    setSemaines(String(data.nb_semaines_defaut));
    setRedoublement(String(data.droit_redoublement_max));
  }, [data]);

  const enregistrer = () => {
    setErreur(null);
    mutation.mutate(
      {
        seuil_validation:   seuil,
        // Vide = les semestrielles s'alignent sur les annuelles. C'est le
        // comportement d'avant la distinction, qu'on ne change qu'à la demande.
        seuil_validation_semestre: seuilSemestre.trim() === '' ? null : seuilSemestre,
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
        réécrit jamais un jury déjà tenu. Le seuil proposé dépend de la portée du jury —
        valider un semestre et prononcer un passage d&apos;année ne se jugent pas
        forcément sur la même exigence.
      </p>

      <Erreur erreur={error} />

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className="block text-xs font-semibold text-iss-dark mb-1.5">
            Seuil — délibération annuelle
          </label>
          <input type="number" min="0" max="20" step="0.25" value={seuil} className={INPUT}
                 onChange={e => setSeuil(e.target.value)} />
          <p className="text-xs text-iss-gray mt-1">Moyenne d&apos;admission / d&apos;autorisation CNIM.</p>
        </div>
        <div>
          <label className="block text-xs font-semibold text-iss-dark mb-1.5">
            Seuil — délibération semestrielle
          </label>
          <input type="number" min="0" max="20" step="0.25" value={seuilSemestre} className={INPUT}
                 placeholder={seuil ? Number(seuil).toFixed(2) : 'Même que l’annuelle'}
                 onChange={e => setSeuilSemestre(e.target.value)} />
          <p className="text-xs text-iss-gray mt-1">Vide = même exigence que l&apos;annuelle.</p>
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
