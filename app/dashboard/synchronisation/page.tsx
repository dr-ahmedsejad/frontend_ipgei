'use client';

import { useState } from 'react';
import {
  AlertTriangle, CheckCircle2, Clock, Copy, Database, Loader2, RefreshCw,
  ShieldCheck, XCircle,
} from 'lucide-react';

import { ConfirmModal } from '@/components/ConfirmModal';
import {
  useHistoriqueSync, useInstance, useSyncMutations,
} from '@/lib/api/sync-hooks';
import type { ResultatSync } from '@/lib/api/sync';
import { formatDateTime } from '@/lib/formatters';

/**
 * Publication de l'état local vers le portail en ligne.
 *
 * Le local est l'autorité, le portail son reflet. Publier remplace le contenu du
 * portail par celui d'ici — sauf la BOÎTE DE RÉCEPTION, ce que les enseignants y
 * ont déposé, qui est exclue du transfert et survit intacte.
 *
 * L'écran s'efface sur une instance miroir : de là, la publication n'a aucun
 * sens, et le serveur la refuserait de toute façon.
 */

const VERT = '#006633';

/** Trois octets ne se lisent pas comme trois mégaoctets. */
function taille(octets: number): string {
  if (octets >= 1024 * 1024) return `${(octets / 1024 / 1024).toFixed(1)} Mo`;
  if (octets >= 1024) return `${Math.round(octets / 1024)} Ko`;
  return `${octets} o`;
}

const ETAPES = [
  'Lecture de la base locale',
  'Construction du dump (hors journaux et boîte de réception)',
  'Empreinte SHA-256',
  'Transfert et restauration sur le portail',
];

export default function SynchronisationPage() {
  const { data: instance, isLoading: chargeInstance } = useInstance();
  const { publier } = useSyncMutations();
  const [aConfirmer, setAConfirmer] = useState(false);
  const [resultat, setResultat] = useState<ResultatSync | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [copie, setCopie] = useState(false);

  const miroir = instance?.mirror_mode ?? false;
  const { data: historique = [], isLoading: chargeHistorique } =
    useHistoriqueSync(!miroir);

  const lancer = () => {
    setErreur(null);
    setResultat(null);
    publier.mutate(undefined, {
      onSuccess: (r) => { setAConfirmer(false); setResultat(r); },
      onError:   (e) => {
        setAConfirmer(false);
        setErreur(e instanceof Error ? e.message : 'Échec de la publication');
      },
    });
  };

  if (chargeInstance) {
    return <p className="text-sm text-iss-gray">Lecture du rôle de l&apos;instance…</p>;
  }

  // Sur le miroir, l'écran n'a pas d'objet : on le dit plutôt que d'afficher un
  // bouton qui répondrait 403.
  if (miroir) {
    return (
      <div className="max-w-3xl">
        <div className="bg-white rounded-2xl shadow-card border border-gray-100 p-6
                        flex items-start gap-3"
             style={{ borderLeft: '3px solid #b45309' }}>
          <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" />
          <div>
            <h1 className="text-sm font-bold text-iss-dark">
              Instance miroir — publication indisponible
            </h1>
            <p className="text-xs text-iss-gray mt-1">
              Vous consultez le <b>portail en ligne</b>, qui reflète le serveur de
              l&apos;établissement. La publication part du serveur local, et de lui
              seul : c&apos;est ce qui garantit qu&apos;un seul des deux fait autorité.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center"
                 style={{ background: `linear-gradient(135deg,${VERT},#008844)` }}>
              <RefreshCw size={14} className="text-white" />
            </div>
            <h1 className="text-lg font-bold text-iss-dark">Synchronisation</h1>
          </div>
          <p className="text-xs text-iss-gray">
            Publier l&apos;état de l&apos;établissement vers le portail en ligne.
          </p>
        </div>

        <button onClick={() => setAConfirmer(true)} disabled={publier.isPending}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm
                           font-semibold text-white shadow-sm disabled:opacity-60"
                style={{ background: `linear-gradient(135deg,${VERT},#008844)` }}>
          {publier.isPending
            ? <Loader2 size={15} className="animate-spin" />
            : <RefreshCw size={15} />}
          {publier.isPending ? 'Publication en cours…' : 'Publier vers le portail'}
        </button>
      </div>

      {/* Ce que la publication fait, et ce qu'elle ne fait pas. La seconde moitié
          rassure autant que la première : un enseignant a déposé des notes en
          ligne ce matin, et l'on s'apprête à écraser le portail. */}
      <div className="bg-white rounded-2xl shadow-card border border-gray-100 p-5
                      grid gap-4 sm:grid-cols-2">
        <div className="flex items-start gap-2.5">
          <Database size={16} className="text-[#006633] shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-iss-dark">Ce qui est remplacé</p>
            <p className="text-xs text-iss-gray mt-0.5">
              Tout le contenu académique du portail : étudiants, inscriptions,
              notes, emplois du temps, documents. Le portail devient la copie
              conforme de ce serveur.
            </p>
          </div>
        </div>
        <div className="flex items-start gap-2.5">
          <ShieldCheck size={16} className="text-[#006633] shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-iss-dark">Ce qui est préservé</p>
            <p className="text-xs text-iss-gray mt-0.5">
              La boîte de réception — réclamations de séances et saisies de notes
              faites en ligne. Elle est exclue du transfert et traverse la
              publication intacte.
            </p>
          </div>
        </div>
      </div>

      {publier.isPending && (
        <div className="bg-white rounded-2xl shadow-card border border-gray-100 p-5">
          <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden mb-3">
            <div className="h-full animate-pulse"
                 style={{ width: '70%', background: `linear-gradient(90deg,${VERT},#008844)` }} />
          </div>
          <ul className="space-y-1.5">
            {ETAPES.map(etape => (
              <li key={etape} className="flex items-center gap-2 text-xs text-iss-gray">
                <Clock size={12} className="shrink-0" /> {etape}
              </li>
            ))}
          </ul>
        </div>
      )}

      {erreur && (
        <div className="bg-white rounded-2xl shadow-card border border-gray-100 p-4
                        flex items-start gap-2.5" style={{ borderLeft: '3px solid #C82020' }}>
          <XCircle size={16} className="text-red-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-iss-dark">Publication refusée</p>
            <p className="text-xs text-iss-gray mt-0.5">{erreur}</p>
          </div>
        </div>
      )}

      {resultat && (
        <div className="bg-white rounded-2xl shadow-card border border-gray-100 overflow-hidden"
             style={{ borderLeft: `3px solid ${VERT}` }}>
          <div className="px-5 py-3 flex items-center gap-2 border-b border-gray-100">
            <CheckCircle2 size={16} className="text-[#006633]" />
            <p className="text-sm font-bold text-iss-dark">
              {resultat.transferred
                ? 'Portail mis à jour'
                : 'Dump construit — aucun transfert'}
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3 p-5">
            {[
              ['Taille', taille(resultat.size)],
              ['Durée', `${resultat.duree_s} s`],
              ['Transfert', resultat.transferred ? 'effectué' : 'non configuré'],
            ].map(([libelle, valeur]) => (
              <div key={libelle} className="rounded-xl border border-gray-100 px-3 py-2">
                <p className="text-[11px] text-iss-gray">{libelle}</p>
                <p className="text-sm font-bold text-iss-dark">{valeur}</p>
              </div>
            ))}
          </div>
          {resultat.detail && (
            <p className="px-5 pb-3 text-xs text-amber-700">{resultat.detail}</p>
          )}
          {resultat.vps && (
            <p className="px-5 pb-3 text-xs text-iss-gray">
              Réponse du portail : <span className="font-mono">{resultat.vps}</span>
            </p>
          )}
          {/* L'empreinte se recopie : c'est elle qu'on compare quand on doute de
              ce que le portail a reçu. */}
          <div className="px-5 pb-4 flex items-center gap-2 flex-wrap">
            <span className="text-[11px] text-iss-gray">SHA-256</span>
            <code className="text-[11px] font-mono text-iss-dark break-all">
              {resultat.sha256}
            </code>
            <button onClick={() => {
                      navigator.clipboard.writeText(resultat.sha256);
                      setCopie(true);
                      setTimeout(() => setCopie(false), 2000);
                    }}
                    className="inline-flex items-center gap-1 text-[11px] text-[#006633] hover:underline">
              <Copy size={11} /> {copie ? 'copiée' : 'copier'}
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-card border border-gray-100 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100">
          <h2 className="text-sm font-bold text-iss-dark">Historique</h2>
        </div>
        {chargeHistorique ? (
          <p className="px-5 py-4 text-xs text-iss-gray">Lecture…</p>
        ) : historique.length === 0 ? (
          <p className="px-5 py-4 text-xs text-iss-gray">
            Aucune publication à ce jour.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-center text-xs font-semibold text-iss-gray uppercase
                               tracking-wide border-b border-gray-100">
                  <th className="px-4 py-2.5">Date</th>
                  <th className="px-4 py-2.5">Par</th>
                  <th className="px-4 py-2.5">État</th>
                  <th className="px-4 py-2.5">Taille</th>
                  <th className="px-4 py-2.5">Durée</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {historique.map(ligne => (
                  <tr key={ligne.id} className="hover:bg-gray-50/60">
                    <td className="px-4 py-2 text-xs text-iss-gray whitespace-nowrap">
                      {formatDateTime(ligne.cree_le)}
                    </td>
                    <td className="px-4 py-2 text-xs text-iss-dark">{ligne.par || '—'}</td>
                    <td className="px-4 py-2 text-center">
                      <span className={`text-[11px] font-semibold ${
                        ligne.statut === 'error' ? 'text-red-600'
                        : ligne.statut === 'synced' ? 'text-[#006633]' : 'text-amber-700'}`}>
                        {ligne.statut === 'error' ? 'échec'
                         : ligne.statut === 'synced' ? 'publié' : 'dump seul'}
                      </span>
                      {ligne.erreur && (
                        <p className="text-[11px] text-iss-gray mt-0.5 max-w-[280px] truncate"
                           title={ligne.erreur}>{ligne.erreur}</p>
                      )}
                    </td>
                    <td className="px-4 py-2 text-center text-xs tabular-nums">
                      {taille(ligne.size)}
                    </td>
                    <td className="px-4 py-2 text-center text-xs tabular-nums">
                      {ligne.duree_s} s
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConfirmModal
        open={aConfirmer}
        title="Publier vers le portail"
        message={
          'Le portail en ligne sera remplacé par l’état de ce serveur : étudiants, '
          + 'inscriptions, notes, emplois du temps et documents. La boîte de '
          + 'réception — réclamations de séances et saisies de notes faites en '
          + 'ligne — est exclue du transfert et sera préservée. Le portail est '
          + 'brièvement indisponible pendant la restauration.'
        }
        confirmLabel="Publier"
        variant="success"
        confirmIcon={<RefreshCw size={14} />}
        onConfirm={lancer}
        onCancel={() => setAConfirmer(false)}
        loading={publier.isPending}
      />
    </div>
  );
}
