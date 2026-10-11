'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Loader2, Megaphone, Send, Smartphone } from 'lucide-react';

import { ConfirmModal } from '@/components/ConfirmModal';
import { ToastContainer, useToast } from '@/components/ui/Toast';
import { apiFetch } from '@/lib/api';
import { CARTE, Chargement, EnTetePage, Erreur, INPUT } from '../ipgei/_ui';

/**
 * Annonces — un message aux étudiants, choisis par cases à cocher.
 *
 * Une case = une classe de l'année en cours (MPSI A…). La tête d'une ligne
 * coche toutes les classes d'un niveau (« toutes les classes MPSI »), la tête
 * d'une colonne la même lettre à tous les niveaux. Chaque
 * étudiant désigné reçoit une notification qui porte le texte ENTIER : la
 * cloche du portail l'affiche, l'app Groupe Polytechnique l'ouvre en grand.
 *
 * Le serveur décode lui-même les cases : l'écran ne choisit jamais les
 * destinataires, il ne fait que les désigner.
 */

// ── Ce qui change d'un établissement à l'autre ──────────────────────────────
/** « Classe A » → « A » : la lettre seule, pour composer « MPSI A ». */
const lettre = (c: Axe) => c.label.replace(/^Classe\s+/, '');
const LIBELLES = {
  sigle: 'IPGEI',
  sousTitre: 'Un message aux étudiants, par classe',
  aide: 'Une case = une classe. Cochez MPSI ou MP pour toutes ses classes.',
  coin: 'Niveau / classe',
  tout: 'Tous les étudiants de l’IPGEI',
  colTout: (c: Axe) => `Toutes les classes ${lettre(c)}`,
  ligneTout: (l: Axe) => `Toutes les classes ${l.label}`,
  caseNom: (l: Axe, c: Axe) => `${l.label} ${lettre(c)}`,
  absente: 'Pas de cette classe à ce niveau',
};

interface Axe { id: string; label: string; sub: string }
interface Case { cle: string; ligne: string; colonne: string; nb: number }
interface Grille { annee: string; lignes: Axe[]; colonnes: Axe[]; cases: Case[] }
interface Annonce {
  id: number; titre: string; texte: string; resume: string;
  nb_destinataires: number; auteur_nom: string; cree_le: string;
}

const API = '/api/v1/annonces/';

export default function AnnoncesPage() {
  const toast = useToast();
  const qc = useQueryClient();
  const { data: grille, isLoading, error } = useQuery({
    queryKey: ['annonces', 'grille'],
    queryFn: () => apiFetch<Grille>(`${API}grille/`),
  });
  const { data: historique = [] } = useQuery({
    queryKey: ['annonces', 'historique'],
    queryFn: () => apiFetch<Annonce[]>(API),
  });

  const [sel, setSel] = useState<Set<string>>(new Set());
  const [titre, setTitre] = useState('');
  const [texte, setTexte] = useState('');
  const [confirmer, setConfirmer] = useState(false);
  const [envoyee, setEnvoyee] = useState<Annonce | null>(null);

  const lignes = useMemo(() => grille?.lignes ?? [], [grille]);
  const colonnes = useMemo(() => grille?.colonnes ?? [], [grille]);
  const parCle = useMemo(() => {
    const m = new Map<string, Case>();
    (grille?.cases ?? []).forEach(c => m.set(`${c.ligne}|${c.colonne}`, c));
    return m;
  }, [grille]);
  const casesDe = (filtre: (c: Case) => boolean) => (grille?.cases ?? []).filter(filtre).map(c => c.cle);
  const toutes = casesDe(() => true);
  const tousOn = (cles: string[]) => cles.length > 0 && cles.every(k => sel.has(k));
  const basculer = (cles: string[], on: boolean) => {
    setEnvoyee(null);
    setSel(prev => {
      const n = new Set(prev);
      cles.forEach(k => (on ? n.add(k) : n.delete(k)));
      return n;
    });
  };

  // Le résumé lisible : colonnes entières, puis lignes entières, puis cases seules.
  const resume = useMemo(() => {
    if (!grille) return [] as string[];
    const on = (cles: string[]) => cles.length > 0 && cles.every(k => sel.has(k));
    if (on(grille.cases.map(c => c.cle))) return [LIBELLES.tout];
    const r: string[] = [];
    const couvert = new Set<string>();
    grille.colonnes.forEach(c => {
      const cles = grille.cases.filter(k => k.colonne === c.id).map(k => k.cle);
      if (cles.length > 1 && on(cles)) { r.push(LIBELLES.colTout(c)); cles.forEach(k => couvert.add(k)); }
    });
    grille.lignes.forEach(l => {
      const cles = grille.cases.filter(k => k.ligne === l.id).map(k => k.cle);
      if (cles.length > 1 && on(cles) && cles.some(k => !couvert.has(k))) {
        r.push(LIBELLES.ligneTout(l)); cles.forEach(k => couvert.add(k));
      }
    });
    grille.lignes.forEach(l => grille.colonnes.forEach(c => {
      const k = parCle.get(`${l.id}|${c.id}`);
      if (k && sel.has(k.cle) && !couvert.has(k.cle)) r.push(LIBELLES.caseNom(l, c));
    }));
    return r;
  }, [grille, sel, parCle]);

  const nbEtudiants = (grille?.cases ?? []).filter(c => sel.has(c.cle)).reduce((n, c) => n + c.nb, 0);
  const pret = sel.size > 0 && nbEtudiants > 0 && titre.trim() !== '' && texte.trim() !== '';

  const envoyer = useMutation({
    mutationFn: () => apiFetch<Annonce>(API, {
      method: 'POST',
      body: { titre: titre.trim(), texte: texte.trim(), cibles: [...sel], resume: resume.join(', ') },
    }),
    onSuccess: a => {
      setConfirmer(false);
      setEnvoyee(a);
      setSel(new Set()); setTitre(''); setTexte('');
      qc.invalidateQueries({ queryKey: ['annonces', 'historique'] });
      toast.success(`Annonce envoyée à ${a.nb_destinataires} étudiant${a.nb_destinataires > 1 ? 's' : ''}.`);
    },
    onError: e => { setConfirmer(false); toast.error((e as Error).message); },
  });

  const gabarit = `minmax(220px, 2.4fr) repeat(${colonnes.length}, minmax(64px, 1fr))`;

  return (
    <div className="space-y-4">
      <ToastContainer toasts={toast.toasts} onClose={toast.removeToast} />
      <ConfirmModal
        open={confirmer}
        title="Envoyer l’annonce ?"
        message={`« ${titre.trim()} » sera envoyée à ${nbEtudiants} étudiant${nbEtudiants > 1 ? 's' : ''} (${resume.join(', ')}). Une notification envoyée ne se retire pas.`}
        confirmLabel="Envoyer"
        variant="success"
        confirmIcon={<Send size={14} />}
        loading={envoyer.isPending}
        onConfirm={() => envoyer.mutate()}
        onCancel={() => setConfirmer(false)}
      />

      <EnTetePage
        icone={<Megaphone size={14} className="text-white" />}
        titre="Annonces"
        sousTitre={LIBELLES.sousTitre}
        actions={
          <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#e8f3ec] text-[#005c2e] text-sm font-semibold">
            <Smartphone size={15} /> Notification sur l’app Groupe Polytechnique + cloche du portail
          </span>
        }
      />

      {envoyee && (
        <div role="status" className="flex items-center gap-2.5 px-4 py-3 rounded-2xl bg-[#e8f3ec] border border-[#b7dcc6] text-[#14532d] text-sm">
          <CheckCircle2 size={18} className="text-[#006633] shrink-0" />
          <span><b>Annonce envoyée</b> à {envoyee.resume || 'la sélection'} ({envoyee.nb_destinataires} étudiant{envoyee.nb_destinataires > 1 ? 's' : ''}). Elle arrive sur leur téléphone dans les deux minutes.</span>
        </div>
      )}

      <Erreur erreur={error} />

      <div className="flex flex-wrap gap-4 items-start">
        {/* 1. Destinataires */}
        <section aria-labelledby="t-dest" className={`${CARTE} p-4 min-w-0`} style={{ flex: '999 1 600px' }}>
          <div className="flex items-baseline justify-between gap-3 flex-wrap mb-3">
            <h2 id="t-dest" className="text-base font-extrabold text-iss-dark">
              <span className="text-[#006633]">1.</span> Destinataires
              {grille?.annee && <span className="ml-2 text-xs font-semibold text-iss-gray">{grille.annee}</span>}
            </h2>
            <span className="text-xs text-iss-gray">{LIBELLES.aide}</span>
          </div>

          {isLoading ? <Chargement /> : lignes.length === 0 ? (
            <p className="text-sm text-iss-gray py-8 text-center">Aucune classe n’est définie pour l’année en cours.</p>
          ) : (
            <div className="overflow-x-auto border border-gray-200 rounded-xl">
              <div style={{ minWidth: 520 }}>
                <div className="grid bg-gray-50 border-b border-gray-200" style={{ gridTemplateColumns: gabarit }}>
                  <label className="flex items-center gap-2.5 px-3 py-2.5 text-[13px] font-extrabold cursor-pointer">
                    <input type="checkbox" className="w-[18px] h-[18px] accent-[#006633]"
                           checked={tousOn(toutes)} onChange={() => basculer(toutes, !tousOn(toutes))} />
                    {LIBELLES.coin}
                  </label>
                  {colonnes.map(c => {
                    const cles = casesDe(k => k.colonne === c.id);
                    const on = tousOn(cles);
                    return (
                      <label key={c.id} title={LIBELLES.colTout(c)}
                             className="flex flex-col items-center gap-1 px-1 py-2 border-l border-gray-200 cursor-pointer">
                        <input type="checkbox" className="w-[18px] h-[18px] accent-[#006633]"
                               aria-label={LIBELLES.colTout(c)} checked={on} onChange={() => basculer(cles, !on)} />
                        <span className="text-[13px] font-extrabold">{c.label}</span>
                        {c.sub && <span className="text-[11px] text-iss-gray leading-tight text-center">{c.sub}</span>}
                      </label>
                    );
                  })}
                </div>
                {lignes.map(l => {
                  const cles = casesDe(k => k.ligne === l.id);
                  const on = tousOn(cles);
                  return (
                    <div key={l.id} className="grid border-b border-gray-100 last:border-b-0" style={{ gridTemplateColumns: gabarit }}>
                      <label title={LIBELLES.ligneTout(l)} className="flex items-center gap-2.5 px-3 py-2.5 cursor-pointer min-w-0">
                        <input type="checkbox" className="w-[18px] h-[18px] accent-[#006633] shrink-0"
                               aria-label={LIBELLES.ligneTout(l)} checked={on} onChange={() => basculer(cles, !on)} />
                        <span className="flex flex-col min-w-0">
                          <span className="text-sm font-extrabold text-iss-dark">{l.label}</span>
                          {l.sub && <span className="text-xs text-iss-gray truncate">{l.sub}</span>}
                        </span>
                      </label>
                      {colonnes.map(c => {
                        const k = parCle.get(`${l.id}|${c.id}`);
                        if (!k) {
                          return (
                            <div key={c.id} className="border-l border-gray-100 flex items-center justify-center min-h-[48px]">
                              <span className="text-gray-300 text-[13px]" title={LIBELLES.absente}>—</span>
                            </div>
                          );
                        }
                        const kon = sel.has(k.cle);
                        return (
                          <label key={c.id} title={`${LIBELLES.caseNom(l, c)} — ${k.nb} étudiant${k.nb > 1 ? 's' : ''}`}
                                 className={`border-l border-gray-100 flex flex-col items-center justify-center gap-0.5 min-h-[48px] cursor-pointer ${kon ? 'bg-[#e8f3ec]' : ''}`}>
                            <input type="checkbox" className="w-[18px] h-[18px] accent-[#006633]"
                                   aria-label={LIBELLES.caseNom(l, c)} checked={kon} onChange={() => basculer([k.cle], !kon)} />
                            <span className="text-[10px] text-iss-gray">{k.nb}</span>
                          </label>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="mt-3.5 flex flex-wrap items-center gap-2">
            <span className="text-[13px] font-bold text-[#475569]">Sélection :</span>
            {resume.map(p => (
              <span key={p} className="inline-flex items-center px-3 py-1 rounded-full bg-[#e8f3ec] text-[#005c2e] text-[13px] font-bold">{p}</span>
            ))}
            {resume.length === 0 && <span className="text-[13px] text-[#9a3412]">Cochez au moins une case.</span>}
            {resume.length > 0 && (nbEtudiants === 0 ? (
              <span className="ml-auto text-[13px] text-[#9a3412]">
                Aucun étudiant de cette sélection n’a de compte : personne ne recevrait l’annonce.
              </span>
            ) : (
              <span className="ml-auto text-[13px] text-iss-dark">
                <b>{nbEtudiants} étudiant{nbEtudiants > 1 ? 's' : ''}</b> {nbEtudiants > 1 ? 'recevront' : 'recevra'} l’annonce
              </span>
            ))}
          </div>
        </section>

        {/* 2. L'annonce */}
        <section aria-labelledby="t-annonce" className={`${CARTE} p-4 min-w-0 flex flex-col gap-3`} style={{ flex: '1 1 400px' }}>
          <h2 id="t-annonce" className="text-base font-extrabold text-iss-dark"><span className="text-[#006633]">2.</span> L’annonce</h2>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="annonce-titre" className="text-[13px] font-bold">Titre</label>
            <input id="annonce-titre" className={INPUT} maxLength={120} value={titre}
                   onChange={e => setTitre(e.target.value)} placeholder="Devoir surveillé de mathématiques" />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="annonce-texte" className="text-[13px] font-bold">Texte de l’annonce</label>
            <textarea id="annonce-texte" className={`${INPUT} resize-y leading-relaxed`} rows={8} maxLength={5000}
                      value={texte} onChange={e => setTexte(e.target.value)} />
            <span className="text-xs text-iss-gray">Le texte entier s’ouvre dans l’app ; la notification n’en montre que le début.</span>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-extrabold text-iss-gray uppercase tracking-wide">Aperçu de la notification</span>
            <div className="flex gap-3 px-3.5 py-3 rounded-xl bg-[#f1f5f9]">
              <div className="w-8 h-8 rounded-lg bg-[#007A45] flex items-center justify-center shrink-0">
                <Megaphone size={16} className="text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between text-[11px] text-iss-gray"><span>Groupe Polytechnique</span><span>maintenant</span></div>
                <div className="text-sm font-extrabold text-iss-dark mt-0.5 truncate">{LIBELLES.sigle} — {titre.trim() || 'Titre de l’annonce'}</div>
                <div className="text-[13px] text-[#334155] mt-0.5 truncate">{texte.trim().split('\n')[0] || 'Début du texte…'}</div>
              </div>
            </div>
          </div>

          <button type="button" disabled={!pret || envoyer.isPending} onClick={() => setConfirmer(true)}
                  className="h-[46px] rounded-xl text-[15px] font-extrabold text-white inline-flex items-center justify-center gap-2 bg-gradient-to-br from-[#006633] to-[#008844] hover:opacity-90 disabled:opacity-45 disabled:cursor-not-allowed">
            {envoyer.isPending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            Envoyer l’annonce
          </button>
        </section>
      </div>

      {/* Historique */}
      <section aria-labelledby="t-hist" className={`${CARTE} p-4`}>
        <h2 id="t-hist" className="text-base font-extrabold text-iss-dark mb-3">Annonces envoyées</h2>
        {historique.length === 0 ? (
          <p className="text-sm text-iss-gray py-4">Aucune annonce envoyée pour l’instant.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px] min-w-[680px]">
              <thead>
                <tr className="text-left text-iss-gray bg-gray-50">
                  <th className="px-3 py-2 font-extrabold rounded-l-lg">Date</th>
                  <th className="px-3 py-2 font-extrabold">Titre</th>
                  <th className="px-3 py-2 font-extrabold">Destinataires</th>
                  <th className="px-3 py-2 font-extrabold text-right">Étudiants</th>
                  <th className="px-3 py-2 font-extrabold rounded-r-lg">Envoyée par</th>
                </tr>
              </thead>
              <tbody>
                {historique.map(a => (
                  <tr key={a.id} className="border-b border-gray-100 align-top">
                    <td className="px-3 py-2.5 text-iss-gray whitespace-nowrap">
                      {new Date(a.cree_le).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="px-3 py-2.5 font-bold text-iss-dark" title={a.texte}>{a.titre}</td>
                    <td className="px-3 py-2.5">{a.resume}</td>
                    <td className="px-3 py-2.5 text-right">{a.nb_destinataires}</td>
                    <td className="px-3 py-2.5 text-iss-gray">{a.auteur_nom}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
