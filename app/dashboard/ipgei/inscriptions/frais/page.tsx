'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, ArrowLeft, Coins, Loader2, Pencil, Plus, Save, Trash2, X } from 'lucide-react';

import { canAccess } from '@/lib/auth';
import { formatNiveau, getNiveauxPossibles, type TypeDiplomeKey } from '@/lib/niveaux';
import { ToastContainer, useToast } from '@/components/ui/Toast';
import LoadingSkeleton from '@/components/ui/LoadingSkeleton';
import {
  useAnneesUniv, useGrilleFraisMutations, useGrillesFrais, type GrilleFrais,
} from '@/lib/api/ipgei-frais';

/** Miroir de `scolarite.TYPE_DIPLOME_CHOICES` — mêmes clés que le socle. */
const TYPE_DIPLOMES: { key: TypeDiplomeKey; label: string }[] = [
  { key: 'LP',       label: 'Licence' },
  { key: 'M',        label: 'Master' },
  { key: 'ING',      label: 'Ingénieur' },
  { key: 'Doctorat', label: 'Doctorat' },
];

/**
 * Correspondance prépa : la 1re année est la MPSI, la 2e la MP.
 *
 * Le socle numérote les années d'étude, il ne connaît pas les classes de
 * prépa. Le rappeler ici évite d'avoir à se souvenir que « niveau 2 » désigne
 * la MP au moment de saisir un montant.
 */
const CLASSE_PREPA: Record<number, string> = { 1: 'MPSI', 2: 'MP' };

type Formulaire = {
  id?:          number;
  annee_univ:   number | '';
  type_diplome: TypeDiplomeKey;
  niveau:       number;
  montant:      string;
  actif:        boolean;
};

const FORMULAIRE_VIDE: Formulaire = {
  annee_univ: '', type_diplome: 'LP', niveau: 1, montant: '', actif: true,
};

/**
 * Grille tarifaire des frais d'inscription.
 *
 * C'est elle qui alimente le montant porté par chaque inscription : sans tarif
 * saisi, une inscription se crée à zéro — visible et corrigeable, mais fausse.
 *
 * La grille est celle du socle, partagée avec le reste de l'établissement :
 * aucun modèle ni endpoint n'est dupliqué. L'écran reprend celui de SIGA, à
 * ceci près qu'il rappelle la classe de prépa correspondant à chaque année
 * d'étude.
 */
export default function GrilleFraisIPGEIPage() {
  const toast   = useToast();
  const canView = canAccess('insc_grille_frais', 'voir');
  const canEdit = canAccess('insc_grille_frais', 'modifier');

  const { data: grilles = [], isLoading } = useGrillesFrais();
  const { data: annees = [] }             = useAnneesUniv();
  const { create, update, remove }        = useGrilleFraisMutations();

  const [form, setForm] = useState<Formulaire>(FORMULAIRE_VIDE);
  const enEdition = form.id != null;

  const niveauxDispo = useMemo(
    () => getNiveauxPossibles(form.type_diplome), [form.type_diplome],
  );

  const reinitialiser = () => setForm(FORMULAIRE_VIDE);

  const editer = (g: GrilleFrais) => {
    setForm({
      id: g.id, annee_univ: g.annee_univ, type_diplome: g.type_diplome as TypeDiplomeKey,
      niveau: g.niveau, montant: g.montant, actif: g.actif,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const enregistrer = () => {
    if (!form.annee_univ || !form.montant) {
      toast.error('Année et montant sont obligatoires.');
      return;
    }
    const corps = {
      annee_univ:   form.annee_univ as number,
      type_diplome: form.type_diplome,
      niveau:       form.niveau,
      montant:      form.montant,
      actif:        form.actif,
    };
    const reussite = (message: string) => () => { toast.success(message); reinitialiser(); };
    const echec = (e: unknown) => toast.error(e instanceof Error ? e.message : 'Erreur');

    if (enEdition) {
      update.mutate({ id: form.id!, input: corps },
        { onSuccess: reussite('Tarif mis à jour'), onError: echec });
    } else {
      create.mutate(corps, { onSuccess: reussite('Tarif ajouté'), onError: echec });
    }
  };

  const supprimer = (g: GrilleFrais) => {
    // Un tarif retiré ne laisse pas de trace à l'écran : les inscriptions de ce
    // niveau se créeront à zéro sans que rien ne le signale ailleurs.
    if (!window.confirm(
      `Supprimer ce tarif ? Les prochaines inscriptions de ${formatNiveau(
        g.niveau, g.type_diplome as TypeDiplomeKey)} se créeront à 0 MRU.`,
    )) return;
    remove.mutate(g.id, {
      onSuccess: () => toast.success('Tarif supprimé'),
      onError:   (e) => toast.error(e instanceof Error ? e.message : 'Erreur'),
    });
  };

  const enCours = create.isPending || update.isPending;

  if (!canView) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-card p-8 text-center space-y-2">
          <AlertCircle size={24} className="mx-auto text-amber-500" />
          <h1 className="text-lg font-bold text-iss-dark">Accès refusé</h1>
          <p className="text-sm text-iss-gray">
            La grille tarifaire est réservée aux administrateurs ou aux rôles autorisés.
          </p>
          <Link href="/dashboard/ipgei/inscriptions"
                className="inline-block text-sm font-semibold text-iss-primary underline underline-offset-2">
            Retour aux inscriptions
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-5 p-2">
      <ToastContainer toasts={toast.toasts} onClose={toast.removeToast} />

      <div className="flex items-center gap-3">
        <Link href="/dashboard/ipgei/inscriptions"
              className="p-2 rounded-xl text-iss-gray hover:bg-gray-50 hover:text-iss-primary transition-colors">
          <ArrowLeft size={18} />
        </Link>
        <div className="w-10 h-10 rounded-xl flex items-center justify-center"
             style={{ background: 'linear-gradient(135deg, #004d24, #006633)' }}>
          <Coins size={20} className="text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-iss-dark">Grille tarifaire</h1>
          <p className="text-sm text-iss-gray">
            Frais d&apos;inscription par année, diplôme et niveau
          </p>
        </div>
      </div>

      {canEdit && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-card p-5 space-y-4">
          <h2 className="font-semibold text-iss-dark flex items-center gap-2">
            {enEdition ? <Pencil size={16} /> : <Plus size={16} />}
            {enEdition ? 'Modifier le tarif' : 'Ajouter un tarif'}
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Champ label="Année universitaire">
              <select value={form.annee_univ} className={CHAMP}
                      onChange={e => setForm(f => ({
                        ...f, annee_univ: e.target.value ? Number(e.target.value) : '',
                      }))}>
                <option value="">— Choisir —</option>
                {annees.map(a => <option key={a.id} value={a.id}>{a.annee}</option>)}
              </select>
            </Champ>

            <Champ label="Type de diplôme">
              <select value={form.type_diplome} className={CHAMP}
                      onChange={e => setForm(f => ({
                        ...f, type_diplome: e.target.value as TypeDiplomeKey, niveau: 1,
                      }))}>
                {TYPE_DIPLOMES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select>
            </Champ>

            <Champ label="Niveau">
              <select value={form.niveau} className={CHAMP}
                      onChange={e => setForm(f => ({ ...f, niveau: Number(e.target.value) }))}>
                {niveauxDispo.map(n => (
                  <option key={n} value={n}>
                    {formatNiveau(n, form.type_diplome)}
                    {CLASSE_PREPA[n] ? ` · prépa ${CLASSE_PREPA[n]}` : ''}
                  </option>
                ))}
              </select>
            </Champ>

            <Champ label="Montant (MRU)">
              <input type="number" min="0" step="0.01" value={form.montant}
                     placeholder="0.00" className={CHAMP}
                     onChange={e => setForm(f => ({ ...f, montant: e.target.value }))} />
            </Champ>
          </div>

          {/* Le montant sera recopié sur chaque inscription puis figé : le dire
              évite de croire qu'une révision corrigera les fiches existantes. */}
          <p className="text-xs text-iss-gray">
            Ce montant sera repris sur chaque nouvelle inscription de ce niveau, puis
            figé : le réviser plus tard ne changera pas ce qui a déjà été facturé.
          </p>

          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm text-iss-gray">
              <input type="checkbox" checked={form.actif} className="rounded border-slate-300"
                     onChange={e => setForm(f => ({ ...f, actif: e.target.checked }))} />
              Actif
            </label>
            <div className="flex gap-2">
              {enEdition && (
                <button onClick={reinitialiser}
                        className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-iss-gray hover:bg-gray-50 flex items-center gap-1.5">
                  <X size={14} /> Annuler
                </button>
              )}
              <button onClick={enregistrer} disabled={enCours}
                      className="px-4 py-2 rounded-xl text-sm font-bold text-white flex items-center gap-1.5 disabled:opacity-50 hover:opacity-90 transition-all"
                      style={{ background: 'linear-gradient(135deg, #006633, #008844)' }}>
                {enCours ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                {enEdition ? 'Enregistrer' : 'Ajouter'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 shadow-card overflow-hidden">
        {isLoading ? (
          <LoadingSkeleton rows={4} cols={4} className="p-6" />
        ) : grilles.length === 0 ? (
          <div className="p-8 text-center text-iss-gray text-sm flex flex-col items-center gap-2">
            <AlertCircle size={20} />
            Aucun tarif défini — les inscriptions se créent à 0 MRU. Ajoutez-en un ci-dessus.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-iss-gray uppercase tracking-wider border-b border-gray-100">
                <th className="px-5 py-3 font-medium">Année</th>
                <th className="px-5 py-3 font-medium">Diplôme</th>
                <th className="px-5 py-3 font-medium">Niveau</th>
                <th className="px-5 py-3 font-medium text-right">Montant (MRU)</th>
                <th className="px-5 py-3 font-medium text-center">Actif</th>
                {canEdit && <th className="px-5 py-3 font-medium text-right">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {grilles.map(g => (
                <tr key={g.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="px-5 py-3 text-iss-dark">{g.annee_univ_label}</td>
                  <td className="px-5 py-3 text-iss-dark">{g.type_diplome_label ?? g.type_diplome}</td>
                  <td className="px-5 py-3 text-iss-dark">
                    {formatNiveau(g.niveau, g.type_diplome as TypeDiplomeKey)}
                    {CLASSE_PREPA[g.niveau] && (
                      <span className="text-iss-gray"> · prépa {CLASSE_PREPA[g.niveau]}</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right font-semibold text-iss-dark">
                    {Number(g.montant).toLocaleString('fr-FR', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-5 py-3 text-center">
                    <span className={`inline-block w-2 h-2 rounded-full ${
                      g.actif ? 'bg-emerald-500' : 'bg-gray-300'}`}
                          title={g.actif ? 'Actif' : 'Inactif'} />
                  </td>
                  {canEdit && (
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => editer(g)} title="Modifier"
                                className="p-1.5 rounded-lg text-iss-gray hover:bg-gray-100 hover:text-iss-primary">
                          <Pencil size={15} />
                        </button>
                        <button onClick={() => supprimer(g)} title="Supprimer"
                                className="p-1.5 rounded-lg text-iss-gray hover:bg-red-50 hover:text-red-600">
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

const CHAMP =
  'w-full h-10 border border-slate-300 rounded-md px-3 text-sm '
  + 'focus:outline-none focus:ring-2 focus:ring-[#006633]/40';

function Champ({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-medium text-slate-600 mb-1 block">{label}</label>
      {children}
    </div>
  );
}
