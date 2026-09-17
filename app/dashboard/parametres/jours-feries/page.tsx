'use client';

/**
 * Jours fériés — les fériés FIXES, et les jours marqués d'une période.
 *
 * Une page à part, avec son entrée dans la barre latérale : cachée dans la page
 * Semaines, cette gestion restait introuvable. On la cherche le jour où un
 * férié tombe, pas en parcourant le paramétrage.
 *
 * DEUX NATURES DE FÉRIÉ.
 *   * Les fériés FIXES reviennent à la même date chaque année. Ils s'appliquent
 *     d'eux-mêmes aux semaines tout juste générées, et à elles seules.
 *   * Les fêtes RELIGIEUSES suivent le calendrier lunaire : leur date change
 *     chaque année. Elles se marquent jour par jour, depuis la page Semaines.
 *
 * « Appliquer les fériés fixes » au calendrier existant annule des séances :
 * l'écran montre d'abord QUELS jours et COMBIEN de séances, et n'applique
 * qu'après confirmation.
 */
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle, ArrowLeft, CalendarOff, CheckCircle, Loader2, Plus, Trash2, X,
} from 'lucide-react';
import { apiFetch, messageLisible } from '@/lib/api';
import { getStoredUser } from '@/lib/auth';
import { useRetour } from '@/lib/retour';
import { ConfirmModal } from '@/components/ConfirmModal';

interface FerieFixe { id: number; jour: number; mois: number; libelle: string; actif: boolean; }
interface JourMarque {
  id: number; date: string; jour: string; libelle: string;
  numero_semaine: number; type_semestre: string; annee_universitaire: string;
}
interface Apercu {
  date: string; jour: string; libelle: string; numero_semaine: number;
  type_semestre: string; annee_universitaire: string; seances_a_annuler: number;
}
interface BilanApplication {
  appliques: { date: string; libelle: string; seances_annulees: number }[];
  ecartes:   { date: string; libelle: string; motif: string }[];
}
interface Year { id: number; annee: string; }

const VERT  = '#006633';
const ROUGE = '#C82010';
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet',
              'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const INPUT = 'w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm bg-gray-50 '
            + 'focus:outline-none focus:bg-white focus:border-[#006633] transition-all';

const pluriel = (n: number, un: string, plusieurs = `${un}s`) => `${n} ${n === 1 ? un : plusieurs}`;

export default function JoursFeriesPage() {
  const retour = useRetour('/dashboard/parametres', 'Paramètres');
  const qc = useQueryClient();
  const user = getStoredUser();

  const [annee, setAnnee]       = useState(user?.annee_universitaire ?? '');
  const [typeSem, setTypeSem]   = useState(user?.semestre === 'Pairs' ? 'P' : 'I');
  const [toast, setToast]       = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  const [nouveau, setNouveau]   = useState({ jour: '', mois: '', libelle: '' });
  const [erreurAjout, setErreurAjout] = useState<string | null>(null);
  const [aSupprimer, setASupprimer]   = useState<FerieFixe | null>(null);
  const [aRetirer, setARetirer]       = useState<JourMarque | null>(null);
  const [apercuOuvert, setApercuOuvert] = useState(false);

  const montrer = (type: 'ok' | 'err', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 6000);
  };

  // ── Lectures ───────────────────────────────────────────────────────────
  const { data: fixes = [], isLoading: chargeFixes } = useQuery({
    queryKey: ['parametres', 'feries-fixes'] as const,
    queryFn:  () => apiFetch<FerieFixe[]>('/api/v1/parametres/jours-feries-fixes/'),
  });
  const { data: annees = [] } = useQuery({
    queryKey: ['parametres', 'annees', 'all'] as const,
    queryFn:  () => apiFetch<Year[]>('/api/v1/parametres/annees/all/'),
  });
  const { data: marques = [], isLoading: chargeMarques } = useQuery({
    queryKey: ['parametres', 'semaines', 'jours-feries', annee, typeSem] as const,
    enabled:  !!annee,
    queryFn:  () => apiFetch<JourMarque[]>(
      `/api/v1/parametres/semaines/jours-feries/?annee_universitaire=${encodeURIComponent(annee)}`
      + (typeSem ? `&type_semestre=${typeSem}` : '')),
  });
  const { data: apercu = [], isFetching: chargeApercu } = useQuery({
    queryKey: ['parametres', 'semaines', 'apercu-feries-fixes', annee, typeSem] as const,
    enabled:  apercuOuvert && !!annee,
    queryFn:  () => apiFetch<Apercu[]>(
      `/api/v1/parametres/semaines/apercu-feries-fixes/?annee_universitaire=${encodeURIComponent(annee)}`
      + (typeSem ? `&type_semestre=${typeSem}` : '')),
  });
  const totalAAnnuler = useMemo(
    () => apercu.reduce((s, a) => s + a.seances_a_annuler, 0), [apercu]);

  const rafraichir = () => {
    qc.invalidateQueries({ queryKey: ['parametres', 'semaines'] });
    qc.invalidateQueries({ queryKey: ['ipgei'] });
  };

  // ── Écritures ──────────────────────────────────────────────────────────
  const ajouter = useMutation({
    mutationFn: () => apiFetch<FerieFixe>('/api/v1/parametres/jours-feries-fixes/', {
      method: 'POST',
      body: { jour: Number(nouveau.jour), mois: Number(nouveau.mois),
              libelle: nouveau.libelle.trim(), actif: true },
    }),
    onSuccess: (f) => {
      qc.invalidateQueries({ queryKey: ['parametres', 'feries-fixes'] });
      setNouveau({ jour: '', mois: '', libelle: '' });
      setErreurAjout(null);
      montrer('ok', `Férié fixe ajouté : ${f.jour} ${MOIS[f.mois - 1]} — ${f.libelle}. `
                    + 'Il s\'appliquera aux semaines générées désormais.');
    },
    onError: (e) => setErreurAjout(messageLisible(e)),
  });

  const basculer = useMutation({
    mutationFn: (f: FerieFixe) => apiFetch<FerieFixe>(
      `/api/v1/parametres/jours-feries-fixes/${f.id}/`,
      { method: 'PATCH', body: { actif: !f.actif } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['parametres', 'feries-fixes'] }),
    onError: (e) => montrer('err', messageLisible(e)),
  });

  const supprimer = useMutation({
    mutationFn: (f: FerieFixe) => apiFetch<void>(
      `/api/v1/parametres/jours-feries-fixes/${f.id}/`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['parametres', 'feries-fixes'] });
      montrer('ok', 'Férié fixe supprimé. Les jours déjà marqués restent fériés.');
    },
    onError: (e) => montrer('err', messageLisible(e)),
    onSettled: () => setASupprimer(null),
  });

  const retirer = useMutation({
    mutationFn: (j: JourMarque) => apiFetch<{ message: string }>(
      '/api/v1/parametres/semaines/retirer-jour-ferie/', {
        method: 'POST',
        body: { annee_universitaire: j.annee_universitaire,
                type_semestre: j.type_semestre, date: j.date },
      }),
    onSuccess: (res) => { rafraichir(); montrer('ok', res.message); },
    onError: (e) => montrer('err', messageLisible(e)),
    onSettled: () => setARetirer(null),
  });

  const appliquer = useMutation({
    mutationFn: () => apiFetch<BilanApplication>(
      '/api/v1/parametres/semaines/appliquer-feries-fixes/', {
        method: 'POST', body: { annee_universitaire: annee, type_semestre: typeSem },
      }),
    onSuccess: (bilan) => {
      rafraichir();
      setApercuOuvert(false);
      const annulees = bilan.appliques.reduce((s, a) => s + a.seances_annulees, 0);
      let msg = bilan.appliques.length
        ? `${pluriel(bilan.appliques.length, 'jour marqué férié', 'jours marqués fériés')} — `
          + pluriel(annulees, 'séance annulée', 'séances annulées')
        : 'Aucun jour à marquer : le calendrier était déjà à jour.';
      if (bilan.ecartes.length) {
        msg += `. ${pluriel(bilan.ecartes.length, 'jour écarté', 'jours écartés')} : `
             + bilan.ecartes.map(e => `${e.date} (${e.motif})`).join(' ; ');
      }
      montrer(bilan.ecartes.length ? 'err' : 'ok', msg);
    },
    onError: (e) => montrer('err', messageLisible(e)),
  });

  const ajoutPret = Number(nouveau.jour) >= 1 && Number(nouveau.mois) >= 1 && nouveau.libelle.trim();

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center gap-3">
        <Link href={retour.href} title={retour.libelle}
          className="p-2 rounded-xl text-iss-gray hover:bg-gray-100 transition-colors">
          <ArrowLeft size={16} />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-0.5">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ background: `linear-gradient(135deg,${VERT},#008844)` }}>
              <CalendarOff size={14} className="text-white" />
            </div>
            <h1 className="text-xl font-bold text-iss-dark">Jours fériés</h1>
          </div>
          <p className="text-sm text-iss-gray">
            Les fériés à date fixe, et les jours marqués sur le calendrier. Pour une fête
            religieuse, dont la date change chaque année, marquez le jour depuis la page{' '}
            <Link href="/dashboard/parametres/semaines" className="underline">Semaines</Link>.
          </p>
        </div>
      </div>

      {/* ── Fériés fixes ────────────────────────────────────────────────── */}
      <section className="bg-white rounded-2xl shadow-card border border-gray-100 p-5 space-y-4">
        <div>
          <h2 className="text-sm font-bold text-iss-dark">Fériés fixes</h2>
          <p className="text-xs text-iss-gray mt-0.5">
            Appliqués d&apos;eux-mêmes aux semaines <b>tout juste générées</b>, et à elles
            seules : un jour plus ancien laissé en cours l&apos;a peut-être été exprès.
          </p>
        </div>

        {chargeFixes ? (
          <Loader2 size={20} className="animate-spin text-iss-primary" />
        ) : fixes.length === 0 ? (
          <p className="text-sm text-iss-gray">Aucun férié fixe enregistré.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr><th>Date</th><th>Libellé</th><th className="w-28">Actif</th><th className="w-16" /></tr>
            </thead>
            <tbody>
              {fixes.map(f => (
                <tr key={f.id} className={f.actif ? '' : 'opacity-60'}>
                  <td className="font-semibold text-sm whitespace-nowrap">{f.jour} {MOIS[f.mois - 1]}</td>
                  <td className="text-sm">{f.libelle}</td>
                  <td>
                    <label className="inline-flex items-center gap-2 text-xs cursor-pointer">
                      <input type="checkbox" checked={f.actif} className="w-4 h-4 accent-[#006633]"
                        disabled={basculer.isPending} onChange={() => basculer.mutate(f)} />
                      {f.actif ? 'actif' : 'inactif'}
                    </label>
                  </td>
                  <td>
                    <button onClick={() => setASupprimer(f)} title="Supprimer ce férié fixe"
                      className="p-1.5 rounded-lg text-iss-gray hover:text-iss-secondary hover:bg-red-50">
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-[80px_160px_1fr_auto] gap-2 items-end">
          <div>
            <label className="block text-xs font-semibold text-iss-dark mb-1.5">Jour</label>
            <input type="number" min={1} max={31} value={nouveau.jour} className={INPUT}
              onChange={e => setNouveau(n => ({ ...n, jour: e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-iss-dark mb-1.5">Mois</label>
            <select value={nouveau.mois} className={INPUT}
              onChange={e => setNouveau(n => ({ ...n, mois: e.target.value }))}>
              <option value="">—</option>
              {MOIS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-iss-dark mb-1.5">Libellé</label>
            <input type="text" value={nouveau.libelle} maxLength={100} className={INPUT}
              placeholder="ex : Fête de l'Indépendance"
              onChange={e => setNouveau(n => ({ ...n, libelle: e.target.value }))} />
          </div>
          <button onClick={() => ajouter.mutate()} disabled={!ajoutPret || ajouter.isPending}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-50"
            style={{ background: `linear-gradient(135deg,${VERT},#008844)` }}>
            {ajouter.isPending ? <Loader2 size={13} className="animate-spin" /> : <Plus size={14} />}
            Ajouter
          </button>
        </div>
        {erreurAjout && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-800">
            <AlertCircle size={14} className="shrink-0 mt-0.5" /> <span>{erreurAjout}</span>
          </div>
        )}
      </section>

      {/* ── Jours marqués d'une période ─────────────────────────────────── */}
      <section className="bg-white rounded-2xl shadow-card border border-gray-100 p-5 space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px]">
            <h2 className="text-sm font-bold text-iss-dark">Jours marqués fériés</h2>
            <p className="text-xs text-iss-gray mt-0.5">
              Un jour marqué garde le numéro de sa semaine ; ses séances sont annulées, pas
              supprimées, et reviennent si vous le rendez aux cours.
            </p>
          </div>
          <div className="w-40">
            <label className="block text-xs font-semibold text-iss-dark mb-1.5">Année</label>
            <select value={annee} onChange={e => setAnnee(e.target.value)} className={INPUT}>
              <option value="">— Choisir —</option>
              {annees.map(a => <option key={a.id} value={a.annee}>{a.annee}</option>)}
            </select>
          </div>
          <div className="w-32">
            <label className="block text-xs font-semibold text-iss-dark mb-1.5">Semestres</label>
            <select value={typeSem} onChange={e => setTypeSem(e.target.value)} className={INPUT}>
              <option value="I">Impairs</option>
              <option value="P">Pairs</option>
            </select>
          </div>
          <button onClick={() => setApercuOuvert(true)} disabled={!annee}
            className="px-4 py-2.5 rounded-xl text-sm font-bold border border-[#006633] text-[#006633] hover:bg-green-50 disabled:opacity-50">
            Appliquer les fériés fixes…
          </button>
        </div>

        {!annee ? (
          <p className="text-sm text-iss-gray">Choisissez une année.</p>
        ) : chargeMarques ? (
          <Loader2 size={20} className="animate-spin text-iss-primary" />
        ) : marques.length === 0 ? (
          <p className="text-sm text-iss-gray">Aucun jour férié marqué sur cette période.</p>
        ) : (
          <table className="data-table">
            <thead><tr><th>Jour</th><th>Férié</th><th className="w-20">Semaine</th><th className="w-16" /></tr></thead>
            <tbody>
              {marques.map(j => (
                <tr key={j.id}>
                  <td className="font-semibold text-sm whitespace-nowrap">{j.jour}</td>
                  <td className="text-sm">{j.libelle}</td>
                  <td className="text-sm">S{j.numero_semaine}</td>
                  <td>
                    <button onClick={() => setARetirer(j)} title="Rendre ce jour aux cours"
                      className="p-1.5 rounded-lg text-iss-gray hover:text-iss-secondary hover:bg-red-50">
                      <X size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* ── Aperçu avant application ───────────────────────────────────── */}
      {apercuOuvert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
          onClick={() => setApercuOuvert(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-iss-dark">
              Appliquer les fériés fixes — {annee}, semestres {typeSem === 'I' ? 'impairs' : 'pairs'}
            </h3>
            {chargeApercu ? (
              <Loader2 size={20} className="animate-spin text-iss-primary" />
            ) : apercu.length === 0 ? (
              <p className="text-sm text-iss-gray">
                Aucun jour de cours de cette période ne tombe sur un férié fixe actif.
              </p>
            ) : (
              <>
                <p className="text-sm text-iss-dark">
                  {pluriel(apercu.length, 'jour serait marqué', 'jours seraient marqués')} férié,
                  et <b>{pluriel(totalAAnnuler, 'séance annulée', 'séances annulées')}</b>.
                  Un jour dont la semaine a déjà un suivi généré sera écarté, sans empêcher les autres.
                </p>
                <ul className="text-sm divide-y divide-gray-100 border border-gray-100 rounded-xl">
                  {apercu.map(a => (
                    <li key={a.date} className="flex justify-between gap-3 px-3 py-2">
                      <span><b>{a.jour}</b> — {a.libelle} <span className="text-iss-gray">(S{a.numero_semaine})</span></span>
                      <span style={{ color: a.seances_a_annuler ? ROUGE : undefined }}
                        className="whitespace-nowrap text-xs font-semibold">
                        {pluriel(a.seances_a_annuler, 'séance', 'séances')}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setApercuOuvert(false)}
                className="px-4 py-2 rounded-xl text-sm font-medium border border-gray-200 text-iss-gray hover:bg-gray-50">
                Annuler
              </button>
              <button onClick={() => appliquer.mutate()}
                disabled={chargeApercu || apercu.length === 0 || appliquer.isPending}
                className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-bold text-white disabled:opacity-50"
                style={{ background: `linear-gradient(135deg,${ROUGE},#e53535)` }}>
                {appliquer.isPending && <Loader2 size={13} className="animate-spin" />}
                Appliquer
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={aSupprimer !== null}
        title="Supprimer ce férié fixe ?"
        message={aSupprimer
          ? `${aSupprimer.jour} ${MOIS[aSupprimer.mois - 1]} — ${aSupprimer.libelle} ne sera plus appliqué aux semaines générées. Les jours déjà marqués restent fériés.`
          : ''}
        confirmLabel="Supprimer"
        variant="danger"
        loading={supprimer.isPending}
        onConfirm={() => aSupprimer && supprimer.mutate(aSupprimer)}
        onCancel={() => setASupprimer(null)}
      />

      <ConfirmModal
        open={aRetirer !== null}
        title="Rendre ce jour aux cours ?"
        message={aRetirer
          ? `${aRetirer.jour} (${aRetirer.libelle}) redevient un jour de cours. Les séances que ce férié avait annulées sont rétablies ; celles annulées à la main restent annulées.`
          : ''}
        confirmLabel="Rendre aux cours"
        loading={retirer.isPending}
        onConfirm={() => aRetirer && retirer.mutate(aRetirer)}
        onCancel={() => setARetirer(null)}
      />

      {toast && (
        <div className="fixed top-6 right-6 z-50 max-w-md flex items-start gap-2 px-4 py-3 rounded-xl text-sm font-semibold text-white shadow-xl"
          style={{ background: toast.type === 'ok'
            ? `linear-gradient(135deg,${VERT},#008844)` : 'linear-gradient(135deg,#C82020,#e53535)' }}>
          {toast.type === 'ok' ? <CheckCircle size={15} className="shrink-0 mt-0.5" />
                               : <AlertCircle size={15} className="shrink-0 mt-0.5" />}
          {toast.msg}
        </div>
      )}
    </div>
  );
}
