'use client';

import { useState } from 'react';
import { Layers, Pencil, Plus, Trash2, X } from 'lucide-react';

import {
  BTN_PRIMAIRE, BTN_SECONDAIRE, Badge, CARTE, Chargement, DEGRADE, Erreur,
  INPUT, SELECT,
} from '@/app/dashboard/ipgei/_ui';
import { useNiveauMutations, useNiveauxCursus } from '@/lib/api/ipgei-hooks';
import { DECISIONS_JURY, type NiveauCursus, type NiveauCursusInput } from '@/types/ipgei';

/** Rangs proposés : le cursus préparatoire tient en deux années. */
const RANGS = [
  { value: 1, label: '1re année' },
  { value: 2, label: '2e année' },
];

const VIDE: NiveauCursusInput = {
  code: '', libelle: '', rang: 1, redoublement_autorise: false,
  decisions_possibles: [], actif: true, ordre: 0,
};

/**
 * Référentiel des niveaux du cursus.
 *
 * MPSI et MP étaient des constantes du code ; quatre règles y étaient adossées
 * — semestres suivis, droit au redoublement, décisions du jury, rang commandant
 * le tarif. Les voir ici, c'est pouvoir en ajouter un — MPI — sans toucher au
 * code, et lire ce que chacun autorise plutôt que le deviner.
 */
export default function BlocNiveaux({ onNotifier }: { onNotifier: (m: string) => void }) {
  const { data: niveaux = [], isLoading, error } = useNiveauxCursus();
  const { create, update, remove } = useNiveauMutations();

  const [edite, setEdite]   = useState<NiveauCursus | null>(null);
  const [ajout, setAjout]   = useState(false);
  const [echec, setEchec]   = useState<string | null>(null);

  const signaler = (e: unknown) => setEchec(e instanceof Error ? e.message : 'Erreur');
  const fermer   = () => { setEdite(null); setAjout(false); setEchec(null); };

  const enregistrer = (valeurs: NiveauCursusInput) => {
    setEchec(null);
    const suite = {
      onSuccess: () => { fermer(); onNotifier('Niveau enregistré'); },
      onError:   signaler,
    };
    if (edite) update.mutate({ id: edite.id, input: valeurs }, suite);
    else       create.mutate(valeurs, suite);
  };

  return (
    <div className={`${CARTE} p-5`}>
      <div className="flex items-center gap-2 mb-1">
        <Layers size={15} className="text-[#006633]" />
        <h2 className="text-sm font-bold text-iss-dark">Niveaux du cursus</h2>
        <button onClick={() => { setAjout(true); setEdite(null); }}
                className={`${BTN_PRIMAIRE} ml-auto`} style={{ background: DEGRADE }}>
          <Plus size={13} /> Ajouter un niveau
        </button>
      </div>
      <p className="text-xs text-iss-gray mb-4">
        Le <strong>rang</strong> suffit à situer un niveau : il commande les semestres
        suivis et le tarif appliqué. Deux niveaux peuvent partager une même année —
        MP et MPI — sans partager leur maquette de matières.
      </p>

      <Erreur erreur={error} />
      {echec && <Erreur erreur={new Error(echec)} />}

      {isLoading && !niveaux.length ? (
        <Chargement texte="Lecture du référentiel…" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold text-iss-gray uppercase tracking-wide border-b border-gray-100">
                <th className="px-3 py-2">Code</th>
                <th className="px-3 py-2">Année</th>
                <th className="px-3 py-2">Semestres</th>
                <th className="px-3 py-2">Redoublement</th>
                <th className="px-3 py-2 text-center">Classes</th>
                <th className="px-3 py-2 text-center">Matières</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {niveaux.map(niveau => (
                <tr key={niveau.id} className={niveau.actif ? '' : 'opacity-50'}>
                  <td className="px-3 py-2">
                    <span className="font-bold text-iss-dark">{niveau.code}</span>
                    {!niveau.actif && <Badge ton="neutre">Désactivé</Badge>}
                    <span className={`block text-xs ${
                      niveau.libelle ? 'text-iss-gray' : 'text-amber-700 italic'}`}>
                      {niveau.libelle || 'Intitulé non renseigné'}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-iss-gray">{niveau.libelle_rang}</td>
                  <td className="px-3 py-2 text-iss-gray">{niveau.codes_semestres.join(' · ')}</td>
                  <td className="px-3 py-2">
                    <Badge ton={niveau.redoublement_autorise ? 'ambre' : 'neutre'}>
                      {niveau.redoublement_autorise ? 'Autorisé' : 'Interdit'}
                    </Badge>
                  </td>
                  {/* Deux colonnes plutôt qu'un « 3 · 16 » : le point médian se
                      lit comme une virgule décimale. */}
                  <td className="px-3 py-2 text-center text-iss-gray">{niveau.nb_classes}</td>
                  <td className="px-3 py-2 text-center text-iss-gray">
                    {niveau.nb_matieres}
                    {niveau.nb_matieres === 0 && (
                      <span className="block text-[11px] text-amber-600">maquette vide</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-1">
                      <button onClick={() => { setEdite(niveau); setAjout(false); setEchec(null); }}
                              title="Modifier"
                              className="p-1.5 rounded-lg text-iss-gray hover:bg-gray-100 hover:text-iss-primary">
                        <Pencil size={14} />
                      </button>
                      {/* Un niveau qui porte des classes ou des matières ne se
                          supprime pas : le serveur le refuse et invite à le
                          désactiver, ce que fait le formulaire. */}
                      <button onClick={() => remove.mutate(niveau.id, {
                                onSuccess: () => onNotifier('Niveau supprimé'),
                                onError: signaler,
                              })}
                              title="Supprimer"
                              className="p-1.5 rounded-lg text-iss-gray hover:bg-red-50 hover:text-red-600">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(ajout || edite) && (
        <FormulaireNiveau
          valeurInitiale={edite ?? VIDE}
          enCours={create.isPending || update.isPending}
          onAnnuler={fermer}
          onValider={enregistrer}
        />
      )}
    </div>
  );
}

function FormulaireNiveau({ valeurInitiale, enCours, onAnnuler, onValider }: {
  valeurInitiale: NiveauCursusInput;
  enCours:        boolean;
  onAnnuler:      () => void;
  onValider:      (valeurs: NiveauCursusInput) => void;
}) {
  const [form, setForm] = useState<NiveauCursusInput>({ ...valeurInitiale });
  const maj = (champ: keyof NiveauCursusInput, valeur: unknown) =>
    setForm(f => ({ ...f, [champ]: valeur }));

  const premiereAnnee = Number(form.rang) === 1;

  const basculerDecision = (code: string) => {
    const actuelles = form.decisions_possibles ?? [];
    maj('decisions_possibles', actuelles.includes(code)
      ? actuelles.filter(d => d !== code)
      : [...actuelles, code]);
  };

  return (
    <div className="mt-4 rounded-xl border border-gray-200 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-iss-dark">
          {valeurInitiale.code ? `Modifier ${valeurInitiale.code}` : 'Nouveau niveau'}
        </h3>
        <button onClick={onAnnuler} className="ml-auto p-1 rounded-lg text-iss-gray hover:bg-gray-100">
          <X size={14} />
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className="block text-xs font-semibold text-iss-dark mb-1.5">Code *</label>
          <input value={form.code ?? ''} placeholder="ex. MPI" className={INPUT}
                 onChange={e => maj('code', e.target.value.toUpperCase())} />
        </div>
        <div className="lg:col-span-2">
          <label className="block text-xs font-semibold text-iss-dark mb-1.5">
            Intitulé du cursus
          </label>
          <input value={form.libelle ?? ''} className={INPUT}
                 placeholder="ex. Mathématique Physique Informatique"
                 onChange={e => maj('libelle', e.target.value)} />
          <p className="text-xs text-iss-gray mt-1">
            Nom développé, tel qu&apos;il coiffe les relevés et le détail des notes.
            Laissé vide, seul le code apparaît.
          </p>
        </div>
        <div>
          <label className="block text-xs font-semibold text-iss-dark mb-1.5">Année *</label>
          <select value={form.rang ?? 1} className={SELECT}
                  onChange={e => {
                    const rang = Number(e.target.value);
                    maj('rang', rang);
                    // La règle du cursus prime sur la saisie : le serveur refuse
                    // le redoublement en 1re année, autant décocher tout de suite.
                    if (rang === 1) maj('redoublement_autorise', false);
                  }}>
            {RANGS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-5">
        <label className={`flex items-center gap-2 text-sm ${premiereAnnee ? 'opacity-50' : ''}`}>
          <input type="checkbox" className="accent-[#006633]"
                 checked={!!form.redoublement_autorise} disabled={premiereAnnee}
                 onChange={e => maj('redoublement_autorise', e.target.checked)} />
          Redoublement autorisé
          {premiereAnnee && (
            <span className="text-xs text-iss-gray">— interdit en 1re année</span>
          )}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="accent-[#006633]"
                 checked={form.actif !== false}
                 onChange={e => maj('actif', e.target.checked)} />
          Actif
        </label>
      </div>

      <div>
        <label className="block text-xs font-semibold text-iss-dark mb-1.5">
          Décisions que le jury peut prononcer
          <span className="font-normal text-iss-gray"> — aucune cochée : celles de l&apos;année</span>
        </label>
        <div className="flex flex-wrap gap-3">
          {DECISIONS_JURY.map(decision => (
            <label key={decision.value} className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" className="accent-[#006633]"
                     checked={(form.decisions_possibles ?? []).includes(decision.value)}
                     onChange={() => basculerDecision(decision.value)} />
              {decision.label}
            </label>
          ))}
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <button onClick={onAnnuler} className={BTN_SECONDAIRE}>Annuler</button>
        <button onClick={() => onValider(form)} disabled={!form.code?.trim() || enCours}
                className={BTN_PRIMAIRE} style={{ background: DEGRADE }}>
          {enCours ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>
    </div>
  );
}
