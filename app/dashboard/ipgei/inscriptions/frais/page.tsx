'use client';

import { useEffect, useMemo, useState } from 'react';
import { Coins, Pencil, Plus, Trash2, X } from 'lucide-react';

import { ConfirmModal } from '@/components/ConfirmModal';
import {
  BTN_PRIMAIRE, BTN_SECONDAIRE, Badge, CARTE, Chargement, DEGRADE, EnTetePage,
  Erreur, INPUT, SELECT, Toast, Vide,
} from '../../_ui';
import {
  NIVEAU_PREPA, useAnneesUniv, useGrilleFraisMutations, useGrillesFrais,
  type GrilleFrais,
} from '@/lib/api/ipgei-frais';

/**
 * Grille tarifaire des frais d'inscription.
 *
 * C'est elle qui alimente le montant porté par chaque inscription : sans tarif
 * saisi, une inscription se crée à zéro — visible et corrigeable, mais fausse.
 *
 * La grille est celle du socle, partagée avec le reste de l'établissement. Cet
 * écran ne fait que la présenter en langage de prépa : on y choisit « 1re
 * année » ou « 2e année », pas « niveau 1 » ou « niveau 2 ».
 */
export default function GrilleFraisIPGEIPage() {
  const [anneeId, setAnneeId]   = useState<number | null>(null);
  const [edition, setEdition]   = useState<GrilleFrais | 'nouveau' | null>(null);
  const [aSupprimer, setASupprimer] = useState<GrilleFrais | null>(null);
  const [toast, setToast]       = useState<string | null>(null);

  const { data: annees = [] } = useAnneesUniv();
  const { data: grilles = [], isLoading, error } = useGrillesFrais(anneeId);
  const { remove } = useGrilleFraisMutations();

  // S'ouvre sur l'année active : c'est celle qu'on vient tarifer.
  useEffect(() => {
    if (anneeId || !annees.length) return;
    setAnneeId((annees.find(a => a.est_active) ?? annees[0]).id);
  }, [annees, anneeId]);

  const notifier = (m: string) => { setToast(m); setTimeout(() => setToast(null), 3000); };

  /** Un tarif par niveau : la grille de la prépa tient en deux lignes. */
  const parNiveau = useMemo(
    () => NIVEAU_PREPA.map(n => ({
      ...n,
      tarif: grilles.find(g => g.niveau === n.niveau && g.actif),
    })),
    [grilles],
  );

  const annee = annees.find(a => a.id === anneeId);

  return (
    <div className="space-y-4">
      <EnTetePage
        icone={<Coins size={14} className="text-white" />}
        titre="Grille tarifaire"
        sousTitre="Frais d'inscription par année d'étude"
        actions={
          <button onClick={() => setEdition('nouveau')} className={BTN_PRIMAIRE}
                  style={{ background: DEGRADE }} disabled={!anneeId}>
            <Plus size={14} /> Ajouter un tarif
          </button>
        }
      />

      <div className={`${CARTE} p-4`}>
        <div className="flex items-end gap-3 flex-wrap">
          <div style={{ minWidth: 220 }}>
            <label className="block text-xs font-semibold text-iss-dark mb-1.5">
              Année universitaire
            </label>
            <select value={anneeId ?? ''} className={SELECT}
                    onChange={e => setAnneeId(e.target.value ? Number(e.target.value) : null)}>
              {annees.map(a => (
                <option key={a.id} value={a.id}>
                  {a.annee}{a.est_active ? ' · en cours' : ''}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <Erreur erreur={error} />

      {isLoading ? (
        <div className={CARTE}><Chargement /></div>
      ) : (
        <div className={`${CARTE} overflow-hidden`}>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold text-iss-gray uppercase tracking-wide border-b border-gray-100">
                <th className="px-4 py-3">Année d&apos;étude</th>
                <th className="px-4 py-3 text-right">Montant</th>
                <th className="px-4 py-3">État</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {parNiveau.map(n => (
                <tr key={n.niveau}>
                  <td className="px-4 py-3 font-semibold text-iss-dark">{n.label}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {n.tarif
                      ? <span className="font-semibold" style={{ color: '#006633' }}>
                          {Number(n.tarif.montant).toLocaleString('fr-FR')} MRU
                        </span>
                      : <span className="text-iss-gray">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    {/* Un tarif manquant n'est pas neutre : toute inscription
                        de ce niveau se créera à zéro sans rien signaler. */}
                    {n.tarif
                      ? <Badge ton="vert">Défini</Badge>
                      : <Badge ton="ambre">Aucun tarif — inscriptions à 0</Badge>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {n.tarif && (
                        <>
                          <button onClick={() => setEdition(n.tarif!)} title="Modifier"
                                  className="p-2 rounded-lg text-iss-gray hover:bg-gray-100 hover:text-[#006633] transition-colors">
                            <Pencil size={13} />
                          </button>
                          <button onClick={() => setASupprimer(n.tarif!)} title="Supprimer"
                                  className="p-2 rounded-lg text-iss-gray hover:bg-red-50 hover:text-red-600 transition-colors">
                            <Trash2 size={13} />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Les tarifs d'autres cursus partagent la même grille : les montrer
          évite de recréer un doublon qui entrerait en conflit d'unicité. */}
      {grilles.filter(g => g.niveau > 2).length > 0 && (
        <div className={`${CARTE} p-4`}>
          <p className="text-xs text-iss-gray mb-2">
            Autres cursus de l&apos;établissement sur la même année — pour information :
          </p>
          <div className="flex flex-wrap gap-2">
            {grilles.filter(g => g.niveau > 2).map(g => (
              <Badge key={g.id} ton="bleu">
                {g.type_diplome_label} N{g.niveau} · {Number(g.montant).toLocaleString('fr-FR')} MRU
              </Badge>
            ))}
          </div>
        </div>
      )}

      {!annees.length && !isLoading && (
        <div className={CARTE}>
          <Vide texte="Aucune année universitaire n'est définie. Créez-en une dans les paramètres du socle." />
        </div>
      )}

      {edition && anneeId && (
        <ModaleTarif
          tarif={edition === 'nouveau' ? null : edition}
          anneeId={anneeId}
          anneeLabel={annee?.annee ?? ''}
          existants={grilles}
          onFerme={() => setEdition(null)}
          onEnregistre={(m) => { setEdition(null); notifier(m); }}
        />
      )}

      <ConfirmModal
        open={!!aSupprimer}
        title="Supprimer ce tarif"
        message={`Les prochaines inscriptions de ${
          NIVEAU_PREPA.find(n => n.niveau === aSupprimer?.niveau)?.label ?? 'ce niveau'
        } se créeront à 0 MRU. Confirmer ?`}
        onConfirm={() => {
          if (aSupprimer) {
            remove.mutate(aSupprimer.id, { onSuccess: () => notifier('Tarif supprimé') });
          }
          setASupprimer(null);
        }}
        onCancel={() => setASupprimer(null)}
      />

      <Toast message={toast} />
    </div>
  );
}

function ModaleTarif({
  tarif, anneeId, anneeLabel, existants, onFerme, onEnregistre,
}: {
  tarif: GrilleFrais | null;
  anneeId: number;
  anneeLabel: string;
  existants: GrilleFrais[];
  onFerme: () => void;
  onEnregistre: (message: string) => void;
}) {
  const { create, update } = useGrilleFraisMutations();
  const [niveau, setNiveau]   = useState(tarif?.niveau ?? 1);
  const [montant, setMontant] = useState(tarif?.montant ?? '');
  const [erreur, setErreur]   = useState<string | null>(null);

  /**
   * Le type de diplôme est repris tel quel en modification.
   *
   * À la création on retient celui déjà employé sur l'année, à défaut « LP » :
   * la grille est unique par (institution, année, type, niveau), et en changer
   * ferait cohabiter deux tarifs pour la même année d'étude — dont un seul
   * serait retenu, sans qu'on sache lequel.
   */
  const typeDiplome = tarif?.type_diplome ?? existants[0]?.type_diplome ?? 'LP';

  const valider = () => {
    const somme = Number(montant);
    if (!montant.trim() || Number.isNaN(somme) || somme < 0) {
      setErreur('Montant invalide.');
      return;
    }
    const doublon = existants.find(
      g => g.niveau === niveau && g.id !== tarif?.id,
    );
    if (doublon) {
      setErreur('Un tarif existe déjà pour cette année d\'étude. Modifiez-le plutôt.');
      return;
    }

    const commun = { montant: String(somme), actif: true };
    const echec = (e: unknown) =>
      setErreur(e instanceof Error ? e.message : 'Enregistrement impossible.');

    if (tarif) {
      update.mutate({ id: tarif.id, input: { ...commun, niveau } }, {
        onSuccess: () => onEnregistre('Tarif modifié'), onError: echec,
      });
    } else {
      create.mutate(
        { ...commun, niveau, annee_univ: anneeId, type_diplome: typeDiplome },
        { onSuccess: () => onEnregistre('Tarif ajouté'), onError: echec },
      );
    }
  };

  const enCours = create.isPending || update.isPending;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className={`${CARTE} p-6 w-full`} style={{ maxWidth: 440 }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-iss-dark">
            {tarif ? 'Modifier le tarif' : 'Ajouter un tarif'} · {anneeLabel}
          </h3>
          <button onClick={onFerme} className="p-1.5 rounded-lg text-iss-gray hover:bg-gray-100">
            <X size={14} />
          </button>
        </div>

        <label className="block text-xs font-semibold text-iss-dark mb-1.5">
          Année d&apos;étude
        </label>
        <select value={niveau} className={SELECT}
                onChange={e => setNiveau(Number(e.target.value))}>
          {NIVEAU_PREPA.map(n => (
            <option key={n.niveau} value={n.niveau}>{n.label}</option>
          ))}
        </select>

        <label className="block text-xs font-semibold text-iss-dark mb-1.5 mt-3">
          Montant <span className="font-normal text-iss-gray">(MRU)</span>
        </label>
        <input value={montant} onChange={e => setMontant(e.target.value)}
               inputMode="numeric" placeholder="35000" className={INPUT} />

        <p className="text-xs text-iss-gray mt-3">
          Ce montant sera repris sur chaque nouvelle inscription de ce niveau, puis
          figé : le réviser plus tard ne changera pas ce qui a déjà été facturé.
        </p>

        {erreur && <p className="text-xs text-red-600 mt-3">{erreur}</p>}

        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onFerme} className={BTN_SECONDAIRE}>Annuler</button>
          <button onClick={valider} disabled={enCours} className={BTN_PRIMAIRE}
                  style={{ background: DEGRADE }}>
            {enCours ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  );
}
