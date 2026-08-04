'use client';

import { useMemo, useState } from 'react';
import { BookOpen, Pencil, Plus, RotateCcw, Search, Trash2, X } from 'lucide-react';

import { ConfirmModal } from '@/components/ConfirmModal';
import { Pagination } from '@/components/Pagination';
import {
  BTN_PRIMAIRE, BTN_SECONDAIRE, Badge, CARTE, Chargement, DEGRADE, EnTetePage,
  Erreur, INPUT, SELECT, Toast, Vide, fmtCoef,
} from '../_ui';
import {
  useMatiereMutations, useMatieres, useNiveauxCursus,
} from '@/lib/api/ipgei-hooks';
import { CODES_SEMESTRE, type CodeSemestre, type Matiere } from '@/types/ipgei';

type Formulaire = {
  code: string; intitule: string; code_semestre: CodeSemestre;
  /** Niveau dont cette matière fait partie de la maquette. */
  niveau_ref: number | null;
  coefficient: string; volume_cm: string; volume_td: string; volume_tp: string; has_tp: boolean;
  pct_ds: string; pct_tp: string; pct_exam: string; ordre: string; actif: boolean;
};

// Défauts du cadrage : 30/70 sans TP, 20/10/70 avec TP.
const PCT_SANS_TP = { pct_ds: '30', pct_tp: '0',  pct_exam: '70' };
const PCT_AVEC_TP = { pct_ds: '20', pct_tp: '10', pct_exam: '70' };

const VIDE: Formulaire = {
  code: '', intitule: '', code_semestre: 'S1', niveau_ref: null, coefficient: '1',
  volume_cm: '0', volume_td: '0', volume_tp: '0',
  has_tp: false, ...PCT_SANS_TP, ordre: '0', actif: true,
};

export default function MatieresIPGEIPage() {
  const { data: niveaux = [] } = useNiveauxCursus(true);
  const [page, setPage]         = useState(1);
  const [recherche, setRecherche] = useState('');
  const [semestre, setSemestre] = useState('');

  const { data, isLoading, error } = useMatieres({
    page, search: recherche || undefined, code_semestre: semestre || undefined,
  });
  const { create, update, remove, reinitialiserPonderation } = useMatiereMutations();

  const [form, setForm]             = useState<Formulaire>(VIDE);
  const [edition, setEdition]       = useState<Matiere | null>(null);
  const [formOuvert, setFormOuvert] = useState(false);
  const [erreurForm, setErreurForm] = useState<string | null>(null);
  const [aSupprimer, setASupprimer] = useState<Matiere | null>(null);
  const [toast, setToast]           = useState<string | null>(null);

  const notifier = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2800); };

  const matieres = data?.results ?? [];
  const total    = data?.count ?? 0;

  const totalPct = useMemo(
    () => Number(form.pct_ds || 0) + Number(form.pct_tp || 0) + Number(form.pct_exam || 0),
    [form.pct_ds, form.pct_tp, form.pct_exam],
  );

  const ouvrirAjout = () => {
    setEdition(null); setForm(VIDE); setErreurForm(null); setFormOuvert(true);
  };

  const ouvrirEdition = (m: Matiere) => {
    setEdition(m);
    setForm({
      code: m.code, intitule: m.intitule, code_semestre: m.code_semestre,
      niveau_ref: m.niveau_ref ?? null,
      coefficient: m.coefficient,
      volume_cm: String(m.volume_cm), volume_td: String(m.volume_td), volume_tp: String(m.volume_tp),
      has_tp: m.has_tp, pct_ds: m.pct_ds, pct_tp: m.pct_tp, pct_exam: m.pct_exam,
      ordre: String(m.ordre), actif: m.actif,
    });
    setErreurForm(null); setFormOuvert(true);
  };

  /** Basculer « comporte des TP » repositionne la pondération sur le défaut adapté. */
  const basculerTP = (has_tp: boolean) =>
    setForm(f => ({ ...f, has_tp, ...(has_tp ? PCT_AVEC_TP : PCT_SANS_TP) }));

  const enregistrer = () => {
    if (!form.code.trim())     { setErreurForm('Le code de la matière est requis.'); return; }
    if (!form.intitule.trim()) { setErreurForm("L'intitulé est requis."); return; }
    if (totalPct !== 100)      { setErreurForm(`La pondération doit totaliser 100 % (actuellement ${totalPct} %).`); return; }
    setErreurForm(null);

    const payload = {
      code:           form.code.trim().toUpperCase(),
      intitule:       form.intitule.trim(),
      code_semestre:  form.code_semestre,
      niveau_ref:     form.niveau_ref,
      coefficient:    form.coefficient || '1',
      volume_cm:      Number(form.volume_cm) || 0,
      volume_td:      Number(form.volume_td) || 0,
      volume_tp:      Number(form.volume_tp) || 0,
      has_tp:         form.has_tp,
      pct_ds:         form.pct_ds,
      pct_tp:         form.has_tp ? form.pct_tp : '0',
      pct_exam:       form.pct_exam,
      ordre:          Number(form.ordre) || 0,
      actif:          form.actif,
    };
    const succes = () => { setFormOuvert(false); notifier(edition ? 'Matière modifiée' : 'Matière créée'); };
    const echec  = (e: unknown) => setErreurForm(e instanceof Error ? e.message : 'Erreur');
    if (edition) update.mutate({ id: edition.id, input: payload }, { onSuccess: succes, onError: echec });
    else         create.mutate(payload, { onSuccess: succes, onError: echec });
  };

  return (
    <div className="space-y-5 max-w-6xl">
      <EnTetePage
        icone={<BookOpen size={14} className="text-white" />}
        titre="Matières et pondération"
        sousTitre={`${total} matière${total !== 1 ? 's' : ''} — la pondération vaut pour toutes les classes du niveau.`}
        actions={
          <button onClick={ouvrirAjout} className={BTN_PRIMAIRE} style={{ background: DEGRADE }}>
            <Plus size={14} /> Ajouter
          </button>
        }
      />

      <div className={`${CARTE} px-4 py-3`} style={{ borderLeft: '3px solid #006633' }}>
        <p className="text-xs text-iss-gray leading-relaxed">
          La pondération est <strong>recopiée dans chaque note au moment du calcul</strong>.
          La modifier ici n&apos;altère aucune note déjà calculée : seuls les calculs
          suivants l&apos;utiliseront.
        </p>
      </div>

      <Erreur erreur={error} />

      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-iss-gray pointer-events-none" />
          <input value={recherche} onChange={e => { setRecherche(e.target.value); setPage(1); }}
                 placeholder="Rechercher un code ou un intitulé…"
                 className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm bg-white focus:outline-none focus:border-[#006633] transition-all" />
        </div>
        <select value={semestre} onChange={e => { setSemestre(e.target.value); setPage(1); }}
                className={SELECT} style={{ width: 170 }}>
          <option value="">Tous les semestres</option>
          {CODES_SEMESTRE.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </div>

      {formOuvert && (
        <div className={`${CARTE} p-6`} style={{ borderLeft: '3px solid #006633' }}>
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-sm font-semibold text-iss-dark">
              {edition ? `Modifier ${edition.code}` : 'Nouvelle matière'}
            </h3>
            <button onClick={() => setFormOuvert(false)}
                    className="p-1 rounded-lg text-iss-gray hover:bg-gray-100 transition-colors">
              <X size={14} />
            </button>
          </div>

          <div className="grid gap-4 sm:grid-cols-6">
            <div className="sm:col-span-1">
              <label className="block text-xs font-semibold text-iss-dark mb-1.5">Code</label>
              <input value={form.code} maxLength={20} className={INPUT} placeholder="MATH"
                     onChange={e => setForm(f => ({ ...f, code: e.target.value }))} autoFocus />
            </div>
            <div className="sm:col-span-3">
              <label className="block text-xs font-semibold text-iss-dark mb-1.5">Intitulé</label>
              <input value={form.intitule} className={INPUT} placeholder="Mathématiques"
                     onChange={e => setForm(f => ({ ...f, intitule: e.target.value }))} />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-iss-dark mb-1.5">Semestre</label>
              <select value={form.code_semestre} className={SELECT}
                      onChange={e => setForm(f => ({ ...f, code_semestre: e.target.value as CodeSemestre }))}>
                {CODES_SEMESTRE.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            {/* Deux niveaux d'une même année suivent les mêmes semestres sans
                partager leur programme : sans ce choix, une matière de MPI
                irait grossir la maquette de MP. */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-iss-dark mb-1.5">Niveau</label>
              <select value={form.niveau_ref ?? ''} className={SELECT}
                      onChange={e => setForm(f => ({
                        ...f, niveau_ref: e.target.value ? Number(e.target.value) : null,
                      }))}>
                <option value="">Déduit du semestre</option>
                {niveaux
                  .filter(n => n.codes_semestres.includes(form.code_semestre))
                  .map(n => (
                    <option key={n.id} value={n.id}>
                      {n.code} — {n.libelle_rang}
                    </option>
                  ))}
              </select>
            </div>

            <div className="sm:col-span-1">
              <label className="block text-xs font-semibold text-iss-dark mb-1.5">Coefficient</label>
              <input type="number" step="0.25" min="0.25" value={form.coefficient} className={INPUT}
                     onChange={e => setForm(f => ({ ...f, coefficient: e.target.value }))} />
            </div>
            <div className="sm:col-span-1">
              <label className="block text-xs font-semibold text-iss-dark mb-1.5">CM (h)</label>
              <input type="number" min="0" value={form.volume_cm} className={INPUT}
                     onChange={e => setForm(f => ({ ...f, volume_cm: e.target.value }))} />
            </div>
            <div className="sm:col-span-1">
              <label className="block text-xs font-semibold text-iss-dark mb-1.5">TD (h)</label>
              <input type="number" min="0" value={form.volume_td} className={INPUT}
                     onChange={e => setForm(f => ({ ...f, volume_td: e.target.value }))} />
            </div>
            <div className="sm:col-span-1">
              <label className="block text-xs font-semibold text-iss-dark mb-1.5">TP (h)</label>
              <input type="number" min="0" value={form.volume_tp} className={INPUT}
                     onChange={e => setForm(f => ({ ...f, volume_tp: e.target.value }))} />
            </div>
            <div className="sm:col-span-1">
              <label className="block text-xs font-semibold text-iss-dark mb-1.5">Ordre</label>
              <input type="number" min="0" value={form.ordre} className={INPUT}
                     onChange={e => setForm(f => ({ ...f, ordre: e.target.value }))} />
            </div>
            <div className="sm:col-span-3 flex items-end pb-2 gap-5">
              <label className="flex items-center gap-2 text-sm text-iss-dark cursor-pointer">
                <input type="checkbox" checked={form.has_tp} className="w-4 h-4 accent-[#006633]"
                       onChange={e => basculerTP(e.target.checked)} />
                Comporte des TP notés
              </label>
              <label className="flex items-center gap-2 text-sm text-iss-dark cursor-pointer">
                <input type="checkbox" checked={form.actif} className="w-4 h-4 accent-[#006633]"
                       onChange={e => setForm(f => ({ ...f, actif: e.target.checked }))} />
                Active
              </label>
            </div>
          </div>

          <div className="mt-5 p-4 rounded-xl bg-gray-50 border border-gray-100">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <h4 className="text-xs font-bold text-iss-dark uppercase tracking-wide">
                Pondération de la moyenne
              </h4>
              <button type="button"
                      onClick={() => setForm(f => ({ ...f, ...(f.has_tp ? PCT_AVEC_TP : PCT_SANS_TP) }))}
                      className="flex items-center gap-1.5 text-xs font-semibold text-[#006633] hover:underline">
                <RotateCcw size={12} /> Remettre le défaut ({form.has_tp ? '20/10/70' : '30/70'})
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-4">
              <ChampPct label="Devoirs surveillés" valeur={form.pct_ds}
                        onChange={v => setForm(f => ({ ...f, pct_ds: v }))} />
              <ChampPct label="Travaux pratiques" valeur={form.pct_tp} desactive={!form.has_tp}
                        onChange={v => setForm(f => ({ ...f, pct_tp: v }))} />
              <ChampPct label="Examen" valeur={form.pct_exam}
                        onChange={v => setForm(f => ({ ...f, pct_exam: v }))} />
              <div className="flex items-end pb-2">
                <span className={`text-sm font-bold ${totalPct === 100 ? 'text-[#006633]' : 'text-red-600'}`}>
                  Total : {totalPct} %
                </span>
              </div>
            </div>

            <p className="text-xs text-iss-gray mt-3 leading-relaxed">
              moyenne = {form.pct_ds || 0} %·moy(DS)
              {form.has_tp && ` + ${form.pct_tp || 0} %·TP`}
              {' '}+ {form.pct_exam || 0} %·moy(examens).
              La moyenne des DS et celle des examens sont arithmétiques, quel que soit leur nombre.
            </p>
          </div>

          {erreurForm && <p className="mt-3 text-sm text-red-600">{erreurForm}</p>}

          <div className="flex gap-2 mt-5">
            <button onClick={enregistrer} disabled={create.isPending || update.isPending}
                    className={BTN_PRIMAIRE} style={{ background: DEGRADE }}>
              {edition ? 'Enregistrer' : 'Créer la matière'}
            </button>
            <button onClick={() => setFormOuvert(false)} className={BTN_SECONDAIRE}>Annuler</button>
          </div>
        </div>
      )}

      <div className={`${CARTE} overflow-hidden`}>
        {isLoading && !data ? <Chargement /> : matieres.length === 0 ? (
          <Vide texte="Aucune matière ne correspond à ces filtres." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold text-iss-gray uppercase tracking-wide border-b border-gray-100">
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3">Intitulé</th>
                  <th className="px-4 py-3">Sem.</th>
                  <th className="px-4 py-3 text-center">Coef.</th>
                  <th className="px-4 py-3 text-center">CM / TD / TP</th>
                  <th className="px-4 py-3 text-center">Pondération</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {matieres.map(m => (
                  <tr key={m.id} className={m.actif ? '' : 'opacity-55'}>
                    <td className="px-4 py-3 font-bold text-iss-dark">{m.code}</td>
                    <td className="px-4 py-3">
                      {m.intitule}
                      {!m.actif && <span className="ml-2"><Badge ton="neutre">Inactive</Badge></span>}
                    </td>
                    <td className="px-4 py-3">
                      <Badge ton={m.niveau === 'MPSI' ? 'bleu' : 'violet'}>{m.code_semestre}</Badge>
                    </td>
                    <td className="px-4 py-3 text-center font-semibold">{fmtCoef(m.coefficient)}</td>
                    <td className="px-4 py-3 text-center text-iss-gray whitespace-nowrap">
                      <span className="font-semibold text-iss-dark">{m.volume_cm}</span>
                      {' / '}{m.volume_td}{' / '}{m.volume_tp}
                      <span className="ml-1 text-xs">({m.volume_horaire} h)</span>
                    </td>
                    <td className="px-4 py-3 text-center whitespace-nowrap">
                      <span className="text-xs font-semibold text-iss-dark">
                        DS {fmtCoef(m.pct_ds)}%
                        {m.has_tp && <> · TP {fmtCoef(m.pct_tp)}%</>}
                        {' '}· Exam {fmtCoef(m.pct_exam)}%
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => reinitialiserPonderation.mutate(m.id, {
                            onSuccess: () => notifier(`Pondération de ${m.code} remise au défaut`),
                          })}
                          title="Remettre la pondération par défaut"
                          className="p-2 rounded-lg text-iss-gray hover:bg-gray-100 hover:text-[#006633] transition-colors">
                          <RotateCcw size={13} />
                        </button>
                        <button onClick={() => ouvrirEdition(m)} title="Modifier"
                                className="p-2 rounded-lg text-iss-gray hover:bg-gray-100 hover:text-[#006633] transition-colors">
                          <Pencil size={13} />
                        </button>
                        <button onClick={() => setASupprimer(m)} title="Supprimer"
                                className="p-2 rounded-lg text-iss-gray hover:bg-red-50 hover:text-red-600 transition-colors">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {(data?.pages ?? 1) > 1 && (
          <div className="px-5 pb-4">
            <Pagination page={page} pages={data?.pages ?? 1} count={total} onPage={setPage} />
          </div>
        )}
      </div>

      <ConfirmModal
        open={!!aSupprimer}
        title="Supprimer la matière"
        message={aSupprimer
          ? `Supprimer ${aSupprimer.code} — ${aSupprimer.intitule} ? Impossible si des notes y sont rattachées : désactivez-la plutôt pour la retirer des saisies futures.`
          : ''}
        onConfirm={() => aSupprimer && remove.mutate(aSupprimer.id, {
          onSuccess: () => { notifier('Matière supprimée'); setASupprimer(null); },
          onError:   () => setASupprimer(null),
        })}
        onCancel={() => setASupprimer(null)}
        loading={remove.isPending}
      />

      <Toast message={toast} />
    </div>
  );
}

function ChampPct({
  label, valeur, onChange, desactive,
}: { label: string; valeur: string; onChange: (v: string) => void; desactive?: boolean }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-iss-dark mb-1.5">{label} (%)</label>
      <input type="number" min="0" max="100" step="1" value={desactive ? '0' : valeur}
             disabled={desactive} className={`${INPUT} disabled:opacity-50`}
             onChange={e => onChange(e.target.value)} />
    </div>
  );
}
