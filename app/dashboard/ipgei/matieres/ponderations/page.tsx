'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowLeft, Plus, Scale, Trash2 } from 'lucide-react';

import {
  BTN_PRIMAIRE, BTN_SECONDAIRE, Badge, CARTE, Chargement, DEGRADE, EnTetePage,
  Erreur, INPUT, SELECT, Toast, Vide,
} from '../../_ui';
import { anneeParDefaut } from '../../_annee';
import {
  useClassesSelect, useMatieresCompletes, usePonderationClasseMutations,
  usePonderationsClasse,
} from '@/lib/api/ipgei-hooks';

/**
 * Les pondérations dérogatoires : une matière comptée autrement pour UNE classe.
 *
 * `Matiere` règle la pondération pour tout un niveau, et c'est le cas général.
 * Mais une classe peut composer autrement : en S4 2025-2026, seule MP A a tenu
 * une colle de maths. La scolarité a compté 20/10/70 pour elle et 30/0/70 pour
 * MP B, MP C et MP D — et nos moyennes s'écartaient des siennes pour 29
 * étudiants, sans que rien ne permette de l'exprimer.
 *
 * Écran à part, et volontairement austère : l'exception doit rester rare et se
 * voir. La mêler à l'écran des matières l'aurait banalisée.
 */

const VIDE = {
  matiere: '', classe: '', pct_ds: '20', pct_tp: '10', pct_exam: '70',
  has_tp: true, coefficient: '', motif: '',
};

export default function PonderationsDerogatoiresPage() {
  const annee = anneeParDefaut();
  const [form, setForm]     = useState(VIDE);
  const [ouvert, setOuvert] = useState(false);
  const [toast, setToast]   = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const { data: derogations = [], isLoading } = usePonderationsClasse();
  // La liste COMPLÈTE et non `select` : il faut le niveau de la matière
  // pour ne proposer que les classes qui peuvent y déroger.
  const { data: matieres = [] } = useMatieresCompletes({ actif: true });
  const { data: classes = [] }  = useClassesSelect({
    annee_universitaire: annee, actif: true,
  });
  const mutations = usePonderationClasseMutations();

  const notifier = (m: string) => { setToast(m); setTimeout(() => setToast(null), 3200); };

  const total = useMemo(
    () => Number(form.pct_ds || 0) + Number(form.pct_tp || 0) + Number(form.pct_exam || 0),
    [form.pct_ds, form.pct_tp, form.pct_exam],
  );
  // La matière choisie dit de quel niveau la classe doit être : en proposer
  // d'un autre ferait échouer l'enregistrement sur une règle du serveur.
  const matiere = matieres.find(m => String(m.id) === form.matiere);
  const classesDuNiveau = useMemo(
    () => (matiere ? classes.filter(c => c.niveau === matiere.niveau) : classes),
    [classes, matiere],
  );

  // Le coefficient général de la matière choisie : il sert d'indication dans le
  // champ, pour qu'on voie à quoi on déroge sans quitter l'écran.
  const coefMatiere = matiere ? String(Number(matiere.coefficient)) : '';

  const pret = form.matiere && form.classe && form.motif.trim() && total === 100;

  const enregistrer = () => {
    setErreur(null);
    mutations.create.mutate(
      {
        matiere: Number(form.matiere), classe: Number(form.classe),
        pct_ds: form.pct_ds, pct_tp: form.pct_tp, pct_exam: form.pct_exam,
        has_tp: form.has_tp,
        // Vide = « garde celui de la matière ». On envoie null et non '' :
        // le sérialiseur attend un décimal ou rien.
        coefficient: form.coefficient.trim() || null,
        motif: form.motif.trim(),
      },
      {
        onSuccess: () => {
          setForm(VIDE); setOuvert(false);
          notifier('Dérogation enregistrée — pensez à recalculer les notes');
        },
        onError: (e) => setErreur(e instanceof Error ? e.message : 'Erreur'),
      },
    );
  };

  const supprimer = (id: number, libelle: string) => {
    if (!confirm(`Supprimer la dérogation ${libelle} ?\n\nLes notes déjà `
      + 'calculées gardent leur pondération : elles ne changeront qu\'au '
      + 'prochain recalcul.')) return;
    mutations.remove.mutate(id, {
      onSuccess: () => notifier('Dérogation supprimée'),
      onError: (e) => setErreur(e instanceof Error ? e.message : 'Erreur'),
    });
  };

  return (
    <div className="space-y-5 max-w-4xl">
      <Toast message={toast} />

      <Link href="/dashboard/ipgei/matieres"
            className="inline-flex items-center gap-1.5 text-sm text-iss-gray hover:text-[#006633] transition-colors">
        <ArrowLeft size={14} /> Matières
      </Link>

      <EnTetePage
        icone={<Scale size={14} className="text-white" />}
        titre="Pondérations dérogatoires"
        sousTitre="Une matière comptée autrement pour une seule classe."
        actions={
          <button onClick={() => { setOuvert(o => !o); setErreur(null); }}
                  className={BTN_PRIMAIRE} style={{ background: DEGRADE }}>
            <Plus size={14} /> Ajouter
          </button>
        }
      />

      {/* Le rappel qui compte : créer la ligne ne recalcule rien. Sans lui, on
          constate des semaines plus tard que les moyennes n'ont pas bougé. */}
      <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl border
                      border-amber-200 bg-amber-50 text-amber-900">
        <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
        <p className="text-sm">
          <span className="font-semibold">Une dérogation ne recalcule rien.</span>{' '}
          Chaque note fige sa pondération au moment du calcul — c&apos;est ce qui
          protège l&apos;historique. Après avoir ajouté ou retiré une ligne, relancez
          le calcul des notes concernées.
        </p>
      </div>

      {ouvert && (
        <div className={`${CARTE} p-5 space-y-4`} style={{ borderLeft: '3px solid #006633' }}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-iss-dark mb-1.5">
                Matière <span className="text-red-600">*</span>
              </label>
              <select value={form.matiere} className={SELECT}
                      onChange={e => setForm(f => ({ ...f, matiere: e.target.value, classe: '' }))}>
                <option value="">Choisir…</option>
                {matieres.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.code} — {m.intitule} ({m.code_semestre})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-iss-dark mb-1.5">
                Classe <span className="text-red-600">*</span>
              </label>
              <select value={form.classe} className={SELECT} disabled={!form.matiere}
                      onChange={e => setForm(f => ({ ...f, classe: e.target.value }))}>
                <option value="">
                  {form.matiere ? 'Choisir…' : "Choisissez d'abord une matière"}
                </option>
                {classesDuNiveau.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
              </select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-4">
            {([['pct_ds', 'DS'], ['pct_tp', 'TP / colle'], ['pct_exam', 'Examen']] as const)
              .map(([champ, label]) => (
                <div key={champ}>
                  <label className="block text-xs font-semibold text-iss-dark mb-1.5">
                    {label} (%)
                  </label>
                  <input type="number" min={0} max={100} value={form[champ]} className={INPUT}
                         onChange={e => setForm(f => ({ ...f, [champ]: e.target.value }))} />
                </div>
              ))}
            <div className="flex items-end pb-2">
              {/* Sans ce drapeau, la classe aurait une part TP qu'elle ne
                  pourrait jamais remplir : la saisie refuserait la fiche. */}
              <label className="flex items-center gap-2 text-sm text-iss-dark cursor-pointer">
                <input type="checkbox" checked={form.has_tp} className="w-4 h-4 accent-[#006633]"
                       onChange={e => setForm(f => ({
                         ...f, has_tp: e.target.checked,
                         pct_tp: e.target.checked ? f.pct_tp : '0',
                       }))} />
                TP notés
              </label>
            </div>
          </div>

          <p className={`text-xs ${total === 100 ? 'text-iss-gray' : 'text-red-600 font-semibold'}`}>
            Total : {total} % {total === 100 ? '' : '— la pondération doit faire 100 %.'}
          </p>

          {/* Le coefficient est d'une AUTRE nature que les pourcentages ci-dessus :
              ceux-ci corrigent la façon de calculer une moyenne, celui-ci change
              ce que le classement récompense. D'où le bloc séparé et l'avertissement. */}
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3">
            <label className="block text-xs font-semibold text-iss-dark mb-1.5">
              Coefficient dérogatoire
              <span className="ml-2 font-normal text-iss-gray">
                — laisser vide pour garder celui de la matière
              </span>
            </label>
            <input type="number" min={0} step="0.5" value={form.coefficient}
                   className={`${INPUT} max-w-[160px]`}
                   placeholder={coefMatiere || 'coefficient'}
                   onChange={e => setForm(f => ({ ...f, coefficient: e.target.value }))} />
            {form.coefficient.trim() !== '' && (
              <p className="text-xs text-amber-900 mt-2 leading-relaxed">
                <strong>Le classement en sera averti.</strong> Toutes les classes d&apos;un
                niveau sont classées dans une seule liste : deux étudiants aux mêmes
                notes n&apos;auront plus le même rang. La feuille de classement le dira.
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-iss-dark mb-1.5">
              Motif <span className="text-red-600">*</span>
            </label>
            <input value={form.motif} className={INPUT}
                   placeholder="Colle de maths tenue en MP A seulement (S4 2025-2026)"
                   onChange={e => setForm(f => ({ ...f, motif: e.target.value }))} />
            {/* Exigé, et pas par formalisme : c'est la seule chose qui, dans
                deux ans, distinguera une dérogation voulue d'une anomalie. */}
            <p className="text-xs text-iss-gray mt-1.5">
              Ce qui justifie l&apos;écart. Dans deux ans, c&apos;est la seule chose qui
              dira si cette ligne est voulue.
            </p>
          </div>

          {erreur && <Erreur erreur={new Error(erreur)} />}

          <div className="flex gap-2">
            <button onClick={enregistrer} disabled={!pret || mutations.create.isPending}
                    className={BTN_PRIMAIRE} style={{ background: DEGRADE }}>
              {mutations.create.isPending ? 'Enregistrement…' : 'Enregistrer'}
            </button>
            <button onClick={() => { setOuvert(false); setForm(VIDE); }}
                    className={BTN_SECONDAIRE}>Annuler</button>
          </div>
        </div>
      )}

      <div className={`${CARTE} overflow-hidden`}>
        {isLoading ? <Chargement /> : derogations.length === 0 ? (
          <Vide texte="Aucune dérogation — toutes les classes suivent la pondération de leur matière." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr className="text-left text-xs font-semibold text-iss-dark">
                  <th className="px-4 py-3">Matière</th>
                  <th className="px-4 py-3">Classe</th>
                  <th className="px-4 py-3">Pondération</th>
                  <th className="px-4 py-3">Coefficient</th>
                  <th className="px-4 py-3">Motif</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {derogations.map(d => (
                  <tr key={d.id}>
                    <td className="px-4 py-3">
                      <span className="font-semibold text-iss-dark">{d.matiere_code}</span>
                      <span className="text-iss-gray"> · {d.semestre_code}</span>
                    </td>
                    <td className="px-4 py-3">
                      <Badge ton="violet">{d.classe_nom}</Badge>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">
                      {Number(d.pct_ds)}/{Number(d.pct_tp)}/{Number(d.pct_exam)}
                      {d.has_tp && <span className="ml-2 text-iss-gray">TP notés</span>}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs whitespace-nowrap">
                      {d.coefficient === null ? (
                        <span className="text-iss-gray">{Number(d.coefficient_matiere)}</span>
                      ) : (
                        <span className="font-semibold text-amber-800">
                          {Number(d.coefficient_matiere)} → {Number(d.coefficient)}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-iss-gray max-w-md">{d.motif}</td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => supprimer(d.id, `${d.matiere_code} · ${d.classe_nom}`)}
                              className="p-1.5 rounded-lg text-iss-gray hover:bg-red-50 hover:text-red-600 transition-colors">
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
