'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Check, PenLine, Pencil, Plus, Trash2, X } from 'lucide-react';

import {
  BTN_PRIMAIRE, BTN_SECONDAIRE, Badge, CARTE, Chargement, DEGRADE, EnTetePage,
  Erreur, INPUT, Toast,
} from '@/app/dashboard/ipgei/_ui';
import { useSignataireMutations, useSignataires } from '@/lib/api/ipgei-hooks';
import type { Signataire } from '@/types/ipgei';

/**
 * Qui signe les documents officiels.
 *
 * Le bloc de signature était figé dans les gabarits, au titre du chef de service
 * de la scolarité — un titre sans nom. Quand son titulaire est en congé, la
 * pièce sortait quand même à son intitulé et un autre signait dessous, sous une
 * fonction qui n'était pas la sienne.
 *
 * Aucune image ici : la signature reste manuscrite. Ce qui se paramètre, ce sont
 * le NOM et la FONCTION imprimés au-dessus du trait. Le signataire retenu est
 * recopié sur chaque document à son émission : changer cette liste ne réécrit
 * jamais une pièce déjà délivrée.
 */

const VIDE: Partial<Signataire> = {
  nom_fr: '', nom_ar: '', titre_fr: 'Chef service de la Scolarité', titre_ar: '',
  par_defaut: false, actif: true, ordre: 0,
};

export default function SignatairesPage() {
  const { data: signataires = [], isLoading, error } = useSignataires();
  const { creer, modifier, desactiver } = useSignataireMutations();

  const [edite, setEdite] = useState<Signataire | null>(null);
  const [ajout, setAjout] = useState(false);
  const [echec, setEchec] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const notifier = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2600); };
  const signaler = (e: unknown) => setEchec(e instanceof Error ? e.message : 'Erreur');
  const fermer   = () => { setEdite(null); setAjout(false); setEchec(null); };

  const enregistrer = (valeurs: Partial<Signataire>) => {
    setEchec(null);
    const suite = {
      onSuccess: () => { fermer(); notifier('Signataire enregistré'); },
      onError:   signaler,
    };
    if (edite) modifier.mutate({ id: edite.id, ...valeurs }, suite);
    else       creer.mutate(valeurs, suite);
  };

  const poserDefaut = (s: Signataire) => {
    setEchec(null);
    modifier.mutate({ id: s.id, par_defaut: true }, {
      onSuccess: () => notifier(`${s.nom_fr} signera par défaut`),
      onError:   signaler,
    });
  };

  return (
    <div className="space-y-5 max-w-5xl">
      <Link href="/dashboard/parametres/cursus"
            className="inline-flex items-center gap-1.5 text-sm text-iss-gray hover:text-[#006633] transition-colors">
        <ArrowLeft size={14} /> Cursus prépa
      </Link>

      <EnTetePage
        icone={<PenLine size={14} className="text-white" />}
        titre="Signataires des documents"
        sousTitre="Qui signe relevés et attestations. La signature reste manuscrite — seul le bloc imprimé change."
      />

      <div className={`${CARTE} p-5`}>
        <div className="flex items-center gap-2 mb-1">
          <PenLine size={15} className="text-[#006633]" />
          <h2 className="text-sm font-bold text-iss-dark">Habilités à signer</h2>
          <button onClick={() => { setAjout(true); setEdite(null); setEchec(null); }}
                  className={`${BTN_PRIMAIRE} ml-auto`} style={{ background: DEGRADE }}>
            <Plus size={13} /> Ajouter un signataire
          </button>
        </div>
        <p className="text-xs text-iss-gray mb-4">
          Le signataire <strong>par défaut</strong> est proposé d&apos;emblée à la génération ;
          l&apos;agent peut en désigner un autre quand le titulaire est absent. Le nom retenu
          est recopié sur le document : modifier cette liste ne change rien aux pièces
          déjà délivrées.
        </p>

        <Erreur erreur={error} />
        {echec && <Erreur erreur={new Error(echec)} />}

        {isLoading && !signataires.length ? (
          <Chargement texte="Lecture des signataires…" />
        ) : signataires.length === 0 ? (
          <p className="text-sm text-iss-gray bg-gray-50 border border-gray-100 rounded-xl px-4 py-3">
            Aucun signataire enregistré. Les documents sortent au titre
            «&nbsp;Chef service de la Scolarité&nbsp;», sans nom — comme aujourd&apos;hui.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold text-iss-gray uppercase tracking-wide border-b border-gray-100">
                  <th className="px-3 py-2">Nom</th>
                  <th className="px-3 py-2">Fonction</th>
                  <th className="px-3 py-2 text-center">Par défaut</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {signataires.map(s => (
                  <tr key={s.id} className={s.actif ? '' : 'opacity-50'}>
                    <td className="px-3 py-2">
                      <span className="font-bold text-iss-dark">{s.nom_fr}</span>
                      {!s.actif && <Badge ton="neutre">Retiré</Badge>}
                      {s.nom_ar && (
                        <span className="block text-xs text-iss-gray" dir="rtl">{s.nom_ar}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-iss-gray">
                      {s.titre_fr}
                      {s.titre_ar && (
                        <span className="block text-xs" dir="rtl">{s.titre_ar}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {s.par_defaut ? (
                        <Badge ton="vert">Par défaut</Badge>
                      ) : s.actif ? (
                        <button onClick={() => poserDefaut(s)} disabled={modifier.isPending}
                                title="Faire signer celui-ci par défaut"
                                className="inline-flex items-center gap-1 text-xs text-iss-gray hover:text-[#006633]">
                          <Check size={12} /> Choisir
                        </button>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => { setEdite(s); setAjout(false); setEchec(null); }}
                                title="Modifier"
                                className="p-1.5 rounded-lg text-iss-gray hover:bg-gray-100 hover:text-iss-primary">
                          <Pencil size={14} />
                        </button>
                        {/* Retirer, pas effacer : les documents qu'il a signés
                            gardent son nom, et l'on veut savoir qui a été
                            habilité. */}
                        {s.actif && (
                          <button onClick={() => desactiver.mutate(s.id, {
                                    onSuccess: () => notifier(`${s.nom_fr} retiré`),
                                    onError:   signaler,
                                  })}
                                  title="Retirer de la liste"
                                  className="p-1.5 rounded-lg text-iss-gray hover:bg-red-50 hover:text-red-600">
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {(ajout || edite) && (
          <FormulaireSignataire
            valeurInitiale={edite ?? VIDE}
            enCours={creer.isPending || modifier.isPending}
            onAnnuler={fermer}
            onValider={enregistrer}
          />
        )}
      </div>

      <Toast message={toast} />
    </div>
  );
}

function FormulaireSignataire({ valeurInitiale, enCours, onAnnuler, onValider }: {
  valeurInitiale: Partial<Signataire>;
  enCours:        boolean;
  onAnnuler:      () => void;
  onValider:      (valeurs: Partial<Signataire>) => void;
}) {
  const [form, setForm] = useState<Partial<Signataire>>({ ...valeurInitiale });
  const maj = (champ: keyof Signataire, valeur: unknown) =>
    setForm(f => ({ ...f, [champ]: valeur }));

  const complet = !!form.nom_fr?.trim() && !!form.titre_fr?.trim();

  return (
    <div className="mt-4 rounded-xl border border-gray-200 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-iss-dark">
          {valeurInitiale.id ? `Modifier ${valeurInitiale.nom_fr}` : 'Nouveau signataire'}
        </h3>
        <button onClick={onAnnuler} className="ml-auto p-1 rounded-lg text-iss-gray hover:bg-gray-100">
          <X size={14} />
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-semibold text-iss-dark mb-1.5">Nom *</label>
          <input value={form.nom_fr ?? ''} className={INPUT}
                 placeholder="ex. Mohamed BENALI"
                 onChange={e => maj('nom_fr', e.target.value)} />
          <p className="text-xs text-iss-gray mt-1">
            Imprimé sous l&apos;espace laissé pour la signature manuscrite.
          </p>
        </div>
        <div>
          <label className="block text-xs font-semibold text-iss-dark mb-1.5">Fonction *</label>
          <input value={form.titre_fr ?? ''} className={INPUT}
                 placeholder="ex. Chef service de la Scolarité"
                 onChange={e => maj('titre_fr', e.target.value)} />
          <p className="text-xs text-iss-gray mt-1">
            Celle au titre de laquelle il signe — c&apos;est elle qui remplace le
            texte figé des gabarits.
          </p>
        </div>
        <div>
          <label className="block text-xs font-semibold text-iss-dark mb-1.5">
            Nom en arabe
          </label>
          <input value={form.nom_ar ?? ''} className={INPUT} dir="rtl"
                 onChange={e => maj('nom_ar', e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-iss-dark mb-1.5">
            Fonction en arabe
          </label>
          <input value={form.titre_ar ?? ''} className={INPUT} dir="rtl"
                 onChange={e => maj('titre_ar', e.target.value)} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-5">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="accent-[#006633]"
                 checked={!!form.par_defaut}
                 onChange={e => maj('par_defaut', e.target.checked)} />
          Signataire par défaut
          <span className="text-xs text-iss-gray">— un seul à la fois</span>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="accent-[#006633]"
                 checked={form.actif !== false}
                 onChange={e => maj('actif', e.target.checked)} />
          Actif
        </label>
      </div>

      <div className="flex justify-end gap-2">
        <button onClick={onAnnuler} className={BTN_SECONDAIRE}>Annuler</button>
        <button onClick={() => onValider(form)} disabled={!complet || enCours}
                className={BTN_PRIMAIRE} style={{ background: DEGRADE }}>
          {enCours ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>
    </div>
  );
}
