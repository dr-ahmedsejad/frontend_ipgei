'use client';

/**
 * Sanctions pour fraude.
 *
 * Une fiche nomme les faits, porte un motif écrit et le PV de délibération qui
 * la fonde, puis met à zéro des notes — une matière entière ou des épreuves
 * précises. Elle ne prononce aucune décision : c'est le jury qui redélibère, et
 * les jurys déjà validés sur ces notes sont signalés ici comme sur leur page.
 *
 * Une sanction ne se supprime pas. Elle se LÈVE, avec un motif : les notes
 * d'origine reviennent, la fiche reste.
 */
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle, ArrowLeft, Download, FileText, Loader2, Lock, Plus, ShieldAlert,
  Undo2, X,
} from 'lucide-react';

import { Pagination } from '@/components/Pagination';
import { ConfirmModal } from '@/components/ConfirmModal';
import { downloadBlob } from '@/lib/downloadBlob';
import { validateUpload } from '@/lib/file-validation';
import { formatDateTime } from '@/lib/formatters';
import {
  BTN_PRIMAIRE, BTN_SECONDAIRE, Badge, CARTE, Chargement, DEGRADE, EnTetePage,
  Erreur, INPUT, SELECT, Toast, Vide, fmtNote,
} from '../_ui';
import { useAnneeIPGEI } from '../_annee';
import { ChampRecherche } from '../_champ-recherche';
import {
  useFraudeMutations, useFraudes, useInscriptions, useSanctionnables,
} from '@/lib/api/ipgei-hooks';
import { fraudesApi } from '@/lib/api/ipgei';
import {
  NATURES_FRAUDE, type ElementDemande, type NoteSanctionnable, type SanctionFraude,
} from '@/types/ipgei';

const message = (e: unknown) => (e instanceof Error ? e.message : 'Une erreur est survenue.');

export default function FraudesPage() {
  const { annee, setAnnee, options } = useAnneeIPGEI();
  const [statut, setStatut]       = useState('appliquee');
  const [recherche, setRecherche] = useState('');
  const [page, setPage]           = useState(1);
  const [declarer, setDeclarer]   = useState(false);
  const [fiche, setFiche]         = useState<number | null>(null);
  const [toast, setToast]         = useState<string | null>(null);
  const notifier = (m: string) => { setToast(m); setTimeout(() => setToast(null), 3500); };

  // Ouverture depuis le bandeau d'un jury : `?fiche=12`. Lu au montage, sans
  // `useSearchParams` qui imposerait une frontière Suspense à toute la page.
  useEffect(() => {
    const id = Number(new URLSearchParams(window.location.search).get('fiche'));
    if (Number.isFinite(id) && id > 0) { setFiche(id); setStatut(''); }
  }, []);

  const { data, isLoading, error } = useFraudes({
    page, id: fiche ?? undefined, statut: statut || undefined, search: recherche.trim() || undefined,
    inscription__annee_universitaire: fiche ? undefined : (annee || undefined),
  });
  const fiches = data?.results ?? [];

  if (declarer) {
    return (
      <Declaration annee={annee}
                   onFermer={() => setDeclarer(false)}
                   onCreee={(s) => {
                     setDeclarer(false); setStatut('appliquee'); setFiche(null);
                     notifier(`Sanction enregistrée — ${s.elements.length} élément(s) mis à zéro`);
                   }} />
    );
  }

  return (
    <div className="space-y-5 max-w-5xl">
      <EnTetePage
        icone={<ShieldAlert size={14} className="text-white" />}
        titre="Fraudes"
        sousTitre="Mettre des notes à zéro sur pièce, et les rendre si la sanction est levée.
                   La décision de passage reste celle du jury."
        actions={
          <button onClick={() => setDeclarer(true)} className={BTN_PRIMAIRE} style={{ background: DEGRADE }}>
            <Plus size={14} /> Déclarer une fraude
          </button>
        }
      />

      <div className="flex gap-2 flex-wrap items-center">
        <select value={annee} onChange={e => { setAnnee(e.target.value); setPage(1); }}
                className={SELECT} style={{ width: 150 }} disabled={fiche != null}>
          {options.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <select value={statut} onChange={e => { setStatut(e.target.value); setPage(1); }}
                className={SELECT} style={{ width: 190 }}>
          <option value="appliquee">Sanctions en vigueur</option>
          <option value="levee">Sanctions levées</option>
          <option value="">Toutes les sanctions</option>
        </select>
        <input value={recherche} onChange={e => { setRecherche(e.target.value); setPage(1); }}
               placeholder="Matricule, nom ou motif…" className={INPUT} style={{ width: 240 }} />
        {fiche != null && (
          <button onClick={() => setFiche(null)} className={BTN_SECONDAIRE}>
            <X size={14} /> Voir toutes les fiches
          </button>
        )}
      </div>

      <Erreur erreur={error} />

      {isLoading && !data ? <div className={CARTE}><Chargement /></div> : fiches.length === 0 ? (
        <div className={CARTE}>
          <Vide texte={statut === 'appliquee'
                         ? 'Aucune sanction en vigueur pour cette année.'
                         : 'Aucune sanction ne correspond.'} />
        </div>
      ) : (
        <div className="space-y-3">
          {fiches.map(s => <Fiche key={s.id} sanction={s} onNotifier={notifier} />)}
        </div>
      )}

      {!fiche && (data?.pages ?? 1) > 1 && (
        <Pagination page={page} pages={data?.pages ?? 1} count={data?.count ?? 0} onPage={setPage} />
      )}

      <Toast message={toast} />
    </div>
  );
}

// ── Une fiche ────────────────────────────────────────────────────────────────
function Fiche({ sanction: s, onNotifier }: { sanction: SanctionFraude; onNotifier: (m: string) => void }) {
  const { lever } = useFraudeMutations();
  const [levee, setLevee]     = useState(false);
  const [motif, setMotif]     = useState('');
  const [confirmer, setConfirmer] = useState(false);
  const [erreur, setErreur]   = useState<string | null>(null);
  const [telechargement, setTelechargement] = useState(false);
  const active = s.statut === 'appliquee';

  const telechargerPv = async () => {
    setTelechargement(true); setErreur(null);
    try { downloadBlob(await fraudesApi.pv(s.id), s.pv_nom || `pv-fraude-${s.id}.pdf`); }
    catch (e) { setErreur(message(e)); }
    finally { setTelechargement(false); }
  };

  return (
    <div className={`${CARTE} p-5 space-y-3`}>
      <div className="flex items-start gap-3 flex-wrap">
        <div className="flex-1 min-w-[240px]">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-sm font-bold text-iss-dark">{s.etudiant_matricule}</span>
            <span className="text-sm font-semibold text-iss-dark">{s.etudiant_nom}</span>
            <Badge>{s.classe_nom}</Badge>
            <Badge ton={active ? 'rouge' : 'neutre'}>{active ? 'En vigueur' : 'Levée'}</Badge>
          </div>
          <p className="text-xs text-iss-gray mt-1">
            {s.nature_display} · faits du {new Date(s.date_faits).toLocaleDateString('fr-FR')}
            {' '}· prononcée le {formatDateTime(s.cree_le)}{s.cree_par_nom && ` par ${s.cree_par_nom}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={telechargerPv} disabled={telechargement} className={BTN_SECONDAIRE}
                  title={s.pv_nom}>
            {telechargement ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            PV
          </button>
          {active && !levee && (
            <button onClick={() => setLevee(true)} className={BTN_SECONDAIRE}>
              <Undo2 size={14} /> Lever
            </button>
          )}
        </div>
      </div>

      <p className="text-sm text-iss-dark whitespace-pre-line">{s.motif}</p>

      <div className="flex flex-wrap gap-2">
        {s.elements.map(el => (
          <span key={el.id}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-gray-200 bg-gray-50 text-xs">
            <span className="font-semibold text-iss-dark">{el.semestre_code} · {el.matiere_code}</span>
            <span className="text-iss-gray">{el.libelle}</span>
            <span className="text-iss-gray tabular-nums">
              {fmtNote(el.note_retenue_avant)} → <b className={active ? 'text-red-700' : 'text-iss-dark'}>
                {fmtNote(el.note_retenue)}</b>
            </span>
          </span>
        ))}
      </div>

      {s.jurys_a_redeliberer.length > 0 && (
        <div className="flex items-start gap-2 px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>
            {active ? 'Jury validé avant la sanction' : 'Jury validé avant la levée'} — à redélibérer :{' '}
            {s.jurys_a_redeliberer.map((j, i) => (
              <span key={j.id}>
                {i > 0 && ', '}
                <Link href={`/dashboard/ipgei/deliberations/${j.id}`} className="underline font-semibold">
                  {j.libelle}
                </Link>
              </span>
            ))}
          </span>
        </div>
      )}

      {!active && (
        <p className="text-xs text-iss-gray">
          Levée le {s.levee_le ? formatDateTime(s.levee_le) : '—'}
          {s.levee_par_nom && ` par ${s.levee_par_nom}`} — {s.motif_levee}
        </p>
      )}

      {levee && (
        <div className="space-y-2 pt-2 border-t border-gray-100">
          <label className="text-xs font-semibold text-iss-gray">Motif de la levée</label>
          <textarea value={motif} onChange={e => setMotif(e.target.value)} rows={2}
                    placeholder="Recours accepté, erreur d'identification…" className={INPUT} />
          <div className="flex gap-2 justify-end">
            <button onClick={() => { setLevee(false); setMotif(''); }} className={BTN_SECONDAIRE}>Annuler</button>
            <button onClick={() => setConfirmer(true)} disabled={!motif.trim()}
                    className={BTN_PRIMAIRE} style={{ background: DEGRADE }}>
              <Undo2 size={14} /> Lever la sanction
            </button>
          </div>
        </div>
      )}

      <Erreur erreur={erreur ? new Error(erreur) : null} />

      <ConfirmModal
        open={confirmer}
        title="Lever la sanction ?"
        message={`Les notes d'origine de ${s.etudiant_matricule} reviennent dans `
          + `${s.elements.length} élément(s). La fiche reste, marquée levée.`}
        confirmLabel="Lever"
        variant="warning"
        loading={lever.isPending}
        onCancel={() => setConfirmer(false)}
        onConfirm={() => lever.mutate({ id: s.id, motif_levee: motif }, {
          onSuccess: (r) => {
            setConfirmer(false); setLevee(false); setMotif('');
            onNotifier(r.ecarts.length
              ? `Sanction levée — ${r.ecarts.length} note(s) recalculée(s) différemment d'avant `
                + `(règles modifiées depuis) : ${r.ecarts.map(e => e.matiere).join(', ')}`
              : 'Sanction levée — notes d’origine restaurées');
          },
          onError: (e) => { setConfirmer(false); setErreur(message(e)); },
        })}
      />
    </div>
  );
}

// ── Déclaration ──────────────────────────────────────────────────────────────
type Choix = { mode: 'rien' | 'matiere' | 'epreuves'; epreuves: string[] };
const cle = (composante: string, numero: number | null) => `${composante}-${numero ?? ''}`;

function Declaration({
  annee, onFermer, onCreee,
}: { annee: string; onFermer: () => void; onCreee: (s: SanctionFraude) => void }) {
  const [texte, setTexte]           = useState('');
  const [inscription, setInscription] = useState('');
  const { data: inscrits, isFetching } = useInscriptions({
    annee_universitaire: annee || undefined, search: texte.trim() || undefined, page: 1,
  });
  const propositions = (inscrits?.results ?? []).map(i => ({
    id: String(i.id), label: `${i.etudiant_matricule} — ${i.etudiant_nom}`, detail: i.classe_nom,
  }));

  const { data: dossier, isLoading, error } = useSanctionnables(inscription ? Number(inscription) : null);
  const { create } = useFraudeMutations();

  const [nature, setNature]   = useState('telephone');
  const [dateFaits, setDate]  = useState('');
  const [motif, setMotif]     = useState('');
  const [pv, setPv]           = useState<File | null>(null);
  const [choix, setChoix]     = useState<Record<number, Choix>>({});
  const [confirmer, setConfirmer] = useState(false);
  const [erreur, setErreur]   = useState<string | null>(null);

  useEffect(() => { setChoix({}); }, [inscription]);

  const elements: ElementDemande[] = useMemo(() => {
    const sortie: ElementDemande[] = [];
    for (const n of dossier?.notes ?? []) {
      const c = choix[n.note];
      if (!c || c.mode === 'rien') continue;
      if (c.mode === 'matiere') { sortie.push({ note: n.note, portee: 'matiere' }); continue; }
      for (const e of n.epreuves) {
        if (c.epreuves.includes(cle(e.composante, e.numero))) {
          sortie.push({ note: n.note, portee: 'epreuve', composante: e.composante, numero: e.numero });
        }
      }
    }
    return sortie;
  }, [choix, dossier]);

  const verrouillees = (dossier?.notes ?? []).filter(n => n.verrouillee && elements.some(e => e.note === n.note));
  const manque = [
    !inscription && 'l’étudiant', !dateFaits && 'la date des faits', !motif.trim() && 'le motif',
    !pv && 'le PV de délibération', elements.length === 0 && 'au moins une matière ou une épreuve',
  ].filter(Boolean) as string[];

  const semestres = useMemo(() => {
    const groupes = new Map<string, NoteSanctionnable[]>();
    for (const n of dossier?.notes ?? []) {
      groupes.set(n.semestre_code, [...(groupes.get(n.semestre_code) ?? []), n]);
    }
    return [...groupes.entries()];
  }, [dossier]);

  const enregistrer = () => create.mutate({
    inscription: Number(inscription), nature, date_faits: dateFaits, motif: motif.trim(),
    pv_deliberation: pv as File, elements,
  }, {
    onSuccess: onCreee,
    onError: (e) => { setConfirmer(false); setErreur(message(e)); },
  });

  return (
    <div className="space-y-5 max-w-5xl">
      <EnTetePage
        icone={<ShieldAlert size={14} className="text-white" />}
        titre="Déclarer une fraude"
        sousTitre="Les notes désignées passent à zéro dès l'enregistrement, même arrêtées par un jury."
        actions={<button onClick={onFermer} className={BTN_SECONDAIRE}><ArrowLeft size={14} /> Retour</button>}
      />

      <div className={`${CARTE} p-5 grid gap-4 md:grid-cols-2`}>
        <div className="md:col-span-2">
          <label className="text-xs font-semibold text-iss-gray">Étudiant ({annee})</label>
          <ChampRecherche value={inscription} propositions={propositions}
                          onChange={setInscription} onSaisie={setTexte}
                          chargement={isFetching} placeholder="Matricule ou nom…"
                          vide="Aucun inscrit ne correspond" />
        </div>
        <div>
          <label className="text-xs font-semibold text-iss-gray">Nature des faits</label>
          <select value={nature} onChange={e => setNature(e.target.value)} className={SELECT}>
            {NATURES_FRAUDE.map(n => <option key={n.value} value={n.value}>{n.label}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold text-iss-gray">Date des faits</label>
          <input type="date" value={dateFaits} max={new Date().toISOString().slice(0, 10)}
                 onChange={e => setDate(e.target.value)} className={INPUT} />
        </div>
        <div className="md:col-span-2">
          <label className="text-xs font-semibold text-iss-gray">Motif</label>
          <textarea value={motif} onChange={e => setMotif(e.target.value)} rows={3} className={INPUT}
                    placeholder="Ce qui a été constaté, par qui, pendant quelle épreuve…" />
        </div>
        <div className="md:col-span-2">
          <label className="text-xs font-semibold text-iss-gray">PV de délibération (PDF, JPEG ou PNG, 5 Mo)</label>
          <div className="flex items-center gap-3 mt-1">
            <label className={`${BTN_SECONDAIRE} cursor-pointer`}>
              <FileText size={14} /> {pv ? 'Changer de fichier' : 'Joindre le PV'}
              <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden"
                     onChange={e => {
                       const f = e.target.files?.[0] ?? null;
                       const refus = f && validateUpload(f, { maxSizeMb: 5, accept: '.pdf,.jpg,.jpeg,.png' });
                       setErreur(refus || null);
                       setPv(refus ? null : f);
                       e.target.value = '';
                     }} />
            </label>
            <span className="text-sm text-iss-gray truncate">{pv?.name ?? 'Aucun fichier'}</span>
          </div>
        </div>
      </div>

      {inscription && (
        <div className={CARTE}>
          <div className="px-5 py-3 border-b border-gray-100">
            <p className="text-sm font-bold text-iss-dark">Notes à mettre à zéro</p>
            <p className="text-xs text-iss-gray">
              Seules les épreuves passées par la classe sont proposées. Une copie non rendue est écrite à zéro.
            </p>
          </div>
          <Erreur erreur={error} />
          {isLoading ? <Chargement /> : (dossier?.notes.length ?? 0) === 0 ? (
            <Vide texte="Aucune note pour cet étudiant." />
          ) : (
            <div className="divide-y divide-gray-100">
              {semestres.map(([code, notes]) => (
                <div key={code}>
                  <p className="px-5 pt-3 pb-1 text-xs font-bold uppercase tracking-wide text-iss-gray">{code}</p>
                  {notes.map(n => (
                    <LigneNote key={n.note} note={n} choix={choix[n.note] ?? { mode: 'rien', epreuves: [] }}
                               onChange={c => setChoix(prec => ({ ...prec, [n.note]: c }))} />
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <Erreur erreur={erreur ? new Error(erreur) : null} />

      <div className="flex items-center justify-end gap-3 flex-wrap">
        {manque.length > 0 && <span className="text-xs text-iss-gray">Manque : {manque.join(', ')}.</span>}
        <button onClick={onFermer} className={BTN_SECONDAIRE}>Annuler</button>
        <button onClick={() => { setErreur(null); setConfirmer(true); }} disabled={manque.length > 0}
                className={BTN_PRIMAIRE} style={{ background: 'linear-gradient(135deg,#C82020,#E03535)' }}>
          <ShieldAlert size={14} /> Sanctionner ({elements.length})
        </button>
      </div>

      <ConfirmModal
        open={confirmer}
        title="Mettre ces notes à zéro ?"
        message={`${dossier?.etudiant_matricule ?? ''} ${dossier?.etudiant_nom ?? ''} : `
          + `${elements.length} élément(s) passent à zéro immédiatement.`
          + (verrouillees.length
            ? ` ${verrouillees.length} note(s) sont arrêtées par un jury validé : il sera signalé à redélibérer.`
            : '')
          + ' La sanction pourra être levée, avec un motif.'}
        confirmLabel="Sanctionner"
        variant="danger"
        confirmIcon={<ShieldAlert size={14} />}
        loading={create.isPending}
        onCancel={() => setConfirmer(false)}
        onConfirm={enregistrer}
      />
    </div>
  );
}

function LigneNote({
  note: n, choix, onChange,
}: { note: NoteSanctionnable; choix: Choix; onChange: (c: Choix) => void }) {
  const bloquee = n.sanction_active != null || n.epreuves.length === 0;
  return (
    <div className={`px-5 py-3 flex items-start gap-3 flex-wrap ${choix.mode !== 'rien' ? 'bg-red-50/40' : ''}`}>
      <div className="flex-1 min-w-[220px]">
        <p className="text-sm font-semibold text-iss-dark">
          {n.matiere_code} <span className="font-normal text-iss-gray">— {n.matiere_intitule}</span>
        </p>
        <p className="text-xs text-iss-gray flex items-center gap-1.5 flex-wrap">
          Note retenue <b className="tabular-nums text-iss-dark">{fmtNote(n.note_retenue)}</b>
          {n.verrouillee && <span className="inline-flex items-center gap-1"><Lock size={11} /> arrêtée par un jury</span>}
          {n.porteuse_code && <span>· DS et TP partagés : à sanctionner sur {n.porteuse_code}</span>}
          {n.sanction_active != null && <span className="text-red-700">· déjà sanctionnée (fiche n° {n.sanction_active})</span>}
          {n.sanction_active == null && n.epreuves.length === 0 && <span>· aucune épreuve tenue</span>}
        </p>
        {choix.mode === 'epreuves' && (
          <div className="flex flex-wrap gap-2 mt-2">
            {n.epreuves.map(e => {
              const k = cle(e.composante, e.numero);
              const coche = choix.epreuves.includes(k);
              return (
                <label key={k}
                       className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs cursor-pointer ${
                         coche ? 'border-red-300 bg-red-50 text-red-800' : 'border-gray-200 bg-white text-iss-dark'}`}>
                  <input type="checkbox" checked={coche}
                         onChange={() => onChange({
                           ...choix,
                           epreuves: coche ? choix.epreuves.filter(x => x !== k) : [...choix.epreuves, k],
                         })} />
                  {e.libelle}
                  <span className="tabular-nums text-iss-gray">{e.valeur == null ? 'non rendue' : fmtNote(e.valeur)}</span>
                </label>
              );
            })}
          </div>
        )}
      </div>
      <select value={choix.mode} disabled={bloquee}
              onChange={e => onChange({ mode: e.target.value as Choix['mode'], epreuves: [] })}
              className={SELECT} style={{ width: 190 }}>
        <option value="rien">Ne pas sanctionner</option>
        <option value="matiere">Matière entière</option>
        <option value="epreuves">Certaines épreuves…</option>
      </select>
    </div>
  );
}
