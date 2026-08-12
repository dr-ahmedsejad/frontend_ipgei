'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, Download, FileSpreadsheet, FileText, Loader2, Plus, Trash2, Users,
} from 'lucide-react';

import { downloadBlob } from '@/lib/downloadBlob';
import {
  BTN_PRIMAIRE, BTN_SECONDAIRE, Badge, CARTE, DEGRADE, EnTetePage, Erreur,
  INPUT, SELECT,
} from '../../_ui';
import { useAnneeIPGEI } from '../../_annee';
import {
  useOptionsNiveaux, useSecretariatAnonymat, useSemestresAll, useSessions,
} from '@/lib/api/ipgei-hooks';
import type { BilanRepartition, LotCorrection } from '@/lib/api/ipgei';

/**
 * Export secrétariat — la table de levée d'anonymat, et la répartition des
 * copies entre correcteurs.
 *
 * Deux documents, et tout tient dans ce qui les sépare :
 *
 *   · la LISTE porte le couple numéro ↔ matricule. Elle ne quitte pas le
 *     secrétariat : c'est elle qui permet de rendre les copies à leurs auteurs
 *     une fois la correction close.
 *   · la RÉPARTITION ne porte que des numéros. La remettre avec les matricules
 *     annulerait l'anonymat au moment précis où il sert.
 *
 * Les numéros valent pour la SESSION, non par matière ni par classe : la liste
 * couvre donc toutes les classes d'un même niveau confondues — un correcteur
 * reçoit un paquet de copies, pas une classe.
 */
export default function ExportSecretariatPage() {
  const { annee, setAnnee, options } = useAnneeIPGEI();

  const [semestreId, setSemestreId] = useState<number | null>(null);
  const [rattrapage, setRattrapage] = useState(false);
  const [niveau, setNiveau]         = useState('');
  const [lots, setLots]   = useState<LotCorrection[]>([{ correcteur: '', nb: 20 }]);
  const [bilan, setBilan] = useState<BilanRepartition | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const { data: semestres = [] } = useSemestresAll({ annee_universitaire: annee });
  const { data: sessions  = [] } = useSessions(annee);
  const niveaux = useOptionsNiveaux();
  const { exporter, apercu, repartir } = useSecretariatAnonymat();

  const semestre = semestres.find(s => s.id === semestreId) ?? null;
  // Une campagne se déduit du semestre et du type d'épreuve : l'anonymat d'une
  // session normale ne désigne pas le même candidat que celui du rattrapage.
  const session = sessions.find(
    s => s.semestre === semestreId
      && s.type_session === (rattrapage ? 'rattrapage' : 'normale')) ?? null;

  // Seuls les niveaux qui suivent ce semestre : proposer les autres donnerait
  // une liste vide sans qu'on comprenne pourquoi.
  const niveauxDuSemestre = useMemo(
    () => (semestre ? niveaux.filter(n => semestre.niveaux.includes(n.value)) : []),
    [niveaux, semestre],
  );

  const pret = !!session;
  const echec = (e: unknown) => setErreur(e instanceof Error ? e.message : 'Erreur');
  const nomFichier = `${semestre?.code ?? ''}_${niveau || 'tous'}`;

  const telecharger = (sortie: 'excel' | 'pdf') => {
    if (!session) return;
    setErreur(null);
    exporter.mutate({ session: session.id, niveau: niveau || undefined, sortie }, {
      onSuccess: (b) => downloadBlob(
        b, `anonymat_${nomFichier}.${sortie === 'excel' ? 'xlsx' : 'pdf'}`),
      onError: echec,
    });
  };

  const lotsValides = lots.filter(l => l.correcteur.trim() && l.nb > 0);

  const voir = () => {
    if (!session || !lotsValides.length) return;
    setErreur(null); setBilan(null);
    apercu.mutate({ session: session.id, lots: lotsValides, niveau: niveau || undefined },
                  { onSuccess: setBilan, onError: echec });
  };

  const imprimer = () => {
    if (!session || !lotsValides.length) return;
    setErreur(null);
    repartir.mutate({ session: session.id, lots: lotsValides, niveau: niveau || undefined },
      { onSuccess: (b) => downloadBlob(b, `repartition_${nomFichier}.pdf`), onError: echec });
  };

  return (
    <div className="space-y-5 max-w-3xl">
      <Link href="/dashboard/ipgei/notes"
            className="inline-flex items-center gap-1.5 text-sm text-iss-gray hover:text-[#006633] transition-colors">
        <ArrowLeft size={14} /> Saisie des notes
      </Link>

      <EnTetePage
        icone={<Users size={14} className="text-white" />}
        titre="Export secrétariat"
        sousTitre="La correspondance anonymat — matricule, et la répartition des copies."
        actions={
          <select value={annee} className={SELECT} style={{ width: 140 }}
                  onChange={e => { setAnnee(e.target.value); setSemestreId(null); setBilan(null); }}>
            {options.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        }
      />

      <div className={`${CARTE} p-6 space-y-4`}>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="block text-xs font-semibold text-iss-dark mb-1.5">
              Semestre <span className="text-red-600">*</span>
            </label>
            <select value={semestreId ?? ''} className={SELECT}
                    onChange={e => { setSemestreId(e.target.value ? Number(e.target.value) : null);
                                     setNiveau(''); setBilan(null); }}>
              <option value="">— Choisir —</option>
              {semestres.map(s => (
                <option key={s.id} value={s.id}>{s.code} — {s.libelle_annee}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-iss-dark mb-1.5">Épreuve</label>
            <select value={rattrapage ? 'ratt' : 'normale'} className={SELECT}
                    onChange={e => { setRattrapage(e.target.value === 'ratt'); setBilan(null); }}>
              <option value="normale">Session normale</option>
              <option value="ratt">Rattrapage</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-iss-dark mb-1.5">Niveau</label>
            <select value={niveau} className={SELECT} disabled={!semestreId}
                    onChange={e => { setNiveau(e.target.value); setBilan(null); }}>
              <option value="">Tous les niveaux</option>
              {niveauxDuSemestre.map(n => (
                <option key={n.value} value={n.value}>{n.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Le tirage précède la correction : sans numéros, il n'y a rien à
            exporter ni à répartir. */}
        {semestreId && !session && (
          <p className="text-xs text-amber-700">
            Aucune campagne ouverte sur ce semestre.
          </p>
        )}

        <div className="flex gap-2 flex-wrap">
          <button onClick={() => telecharger('excel')} disabled={!pret || exporter.isPending}
                  className={BTN_PRIMAIRE} style={{ background: DEGRADE }}>
            {exporter.isPending
              ? <Loader2 size={14} className="animate-spin" />
              : <FileSpreadsheet size={14} />}
            Liste Excel
          </button>
          <button onClick={() => telecharger('pdf')} disabled={!pret || exporter.isPending}
                  className={BTN_SECONDAIRE}>
            <FileText size={14} /> Liste PDF
          </button>
        </div>

        <p className="text-xs text-iss-gray">
          Deux colonnes, numéro d&apos;anonymat et matricule, toutes classes du
          niveau confondues. <b>Cette liste ne se remet pas aux correcteurs</b> :
          c&apos;est elle qui lève l&apos;anonymat.
        </p>
      </div>

      {/* ── Répartition des copies ─────────────────────────────────────── */}
      <div className={`${CARTE} p-6 space-y-4`}>
        <div>
          <h2 className="text-sm font-bold text-iss-dark">Répartir les copies</h2>
          <p className="text-xs text-iss-gray mt-1">
            Nommez les correcteurs et le nombre de copies de chacun. Les paquets
            suivent l&apos;ordre des numéros — «&nbsp;du n° 1 au n° 20&nbsp;». La
            feuille remise ne porte <b>aucun matricule</b>.
          </p>
        </div>

        <div className="space-y-2">
          {lots.map((lot, index) => (
            <div key={index} className="flex gap-2 items-center">
              <input value={lot.correcteur} placeholder="Nom du correcteur"
                     className={`${INPUT} flex-1`}
                     onChange={e => {
                       const suite = [...lots];
                       suite[index] = { ...lot, correcteur: e.target.value };
                       setLots(suite); setBilan(null);
                     }} />
              <input type="number" min={1} value={lot.nb}
                     className={INPUT} style={{ width: 90, textAlign: 'center' }}
                     onChange={e => {
                       const suite = [...lots];
                       suite[index] = { ...lot, nb: Math.max(1, Number(e.target.value) || 1) };
                       setLots(suite); setBilan(null);
                     }} />
              <span className="text-xs text-iss-gray w-12">copies</span>
              <button onClick={() => { setLots(lots.filter((_, i) => i !== index)); setBilan(null); }}
                      disabled={lots.length === 1}
                      aria-label="Retirer ce correcteur"
                      className="p-2 rounded-lg text-iss-gray hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-30">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          <button onClick={() => setLots([...lots, { correcteur: '', nb: 20 }])}
                  className={BTN_SECONDAIRE}>
            <Plus size={14} /> Ajouter un correcteur
          </button>
        </div>

        {erreur && <Erreur erreur={new Error(erreur)} />}

        <div className="flex gap-2 flex-wrap">
          <button onClick={voir} disabled={!pret || !lotsValides.length || apercu.isPending}
                  className={BTN_SECONDAIRE}>
            {apercu.isPending
              ? <Loader2 size={14} className="animate-spin" /> : <Users size={14} />}
            Voir la répartition
          </button>
          <button onClick={imprimer} disabled={!pret || !lotsValides.length || repartir.isPending}
                  className={BTN_PRIMAIRE} style={{ background: DEGRADE }}>
            {repartir.isPending
              ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            Feuilles de correction
          </button>
        </div>

        {bilan && (
          <div className="space-y-2 pt-3" style={{ borderTop: '1px solid #f1f5f9' }}>
            <div className="flex items-center gap-2 flex-wrap">
              <Badge ton={bilan.restantes.length ? 'ambre' : 'vert'}>
                {bilan.reparties} / {bilan.total}
              </Badge>
              <span className="text-sm text-iss-dark">copies réparties</span>
            </div>
            <ul className="text-xs text-iss-gray space-y-0.5">
              {bilan.paquets.map(p => (
                <li key={p.correcteur}>
                  <b className="text-iss-dark">{p.correcteur}</b> — {p.nb} copie
                  {p.nb > 1 ? 's' : ''}, du n° {p.premier} au n° {p.dernier}
                </li>
              ))}
            </ul>
            {/* Les copies non attribuées sont dites, jamais réparties d'office :
                le secrétariat doit voir ce qu'il garde en main. */}
            {bilan.restantes.length > 0 && (
              <p className="text-xs text-amber-700">
                {bilan.restantes.length} copie{bilan.restantes.length > 1 ? 's' : ''} sans
                correcteur : n° {bilan.restantes.join(', ')}.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
