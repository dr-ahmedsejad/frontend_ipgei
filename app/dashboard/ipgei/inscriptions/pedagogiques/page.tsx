'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, ArrowLeft, BookOpen, Check, Loader2, RefreshCw } from 'lucide-react';

import { apiFetch } from '@/lib/api';
import { ToastContainer, useToast } from '@/components/ui/Toast';
import LoadingSkeleton from '@/components/ui/LoadingSkeleton';
import { Badge, CARTE, SELECT, Vide } from '../../_ui';
import { anneeParDefaut } from '../../_annee';
import { useClassesSelect } from '@/lib/api/ipgei-hooks';

interface LigneMaquette {
  inscription: number;
  etudiant:    string;
  attendues:   number;
  rattachees:  number;
  manquantes:  string[];
}

interface Maquette {
  classe:    string;
  niveau:    string;
  semestres: string[];
  attendues: number;
  lignes:    LigneMaquette[];
}

/**
 * Inscriptions pédagogiques — en lecture.
 *
 * Il n'y a rien à y saisir : entrer dans une classe inscrit d'office à toute
 * la maquette du niveau, sans dette ni crédit. C'est justement ce qui rend
 * cette vue nécessaire — un automatisme dont on ne vérifie jamais le résultat
 * finit par manquer quelqu'un, et cela ne se découvre qu'en délibération.
 *
 * Le bouton de rattachement n'est donc pas un mode de saisie : c'est une
 * réparation, pour les cas où l'automatisme a échoué.
 */
export default function InscriptionsPedagogiquesPage() {
  const toast = useToast();
  const qc    = useQueryClient();
  const annee = anneeParDefaut();

  const [classeId, setClasseId] = useState<number | null>(null);

  const { data: classes = [] } = useClassesSelect({ annee_universitaire: annee, actif: true });

  const cle = ['ipgei', 'maquette', classeId ?? 0] as const;
  const { data, isLoading } = useQuery({
    queryKey: cle,
    queryFn:  () => apiFetch<Maquette>('/api/v1/ipgei/inscriptions/maquette/',
      { params: { classe: classeId as number } }),
    enabled:  classeId != null,
  });

  const rattacher = useMutation({
    mutationFn: () => apiFetch<{ notes_creees: number }>(
      '/api/v1/ipgei/inscriptions/rattacher-matieres/',
      { method: 'POST', body: { classe: classeId } },
    ),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: cle });
      toast.success(r.notes_creees
        ? `${r.notes_creees} rattachement(s) effectué(s)`
        : 'Rien à rattacher : la maquette est complète');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Erreur'),
  });

  const incomplets = (data?.lignes ?? []).filter(l => l.manquantes.length > 0);

  return (
    <div className="max-w-5xl mx-auto space-y-5 p-2">
      <ToastContainer toasts={toast.toasts} onClose={toast.removeToast} />

      <div className="flex items-center gap-3">
        <Link href="/dashboard/ipgei/inscriptions"
              className="p-2 rounded-xl text-iss-gray hover:bg-gray-50 hover:text-iss-primary transition-colors">
          <ArrowLeft size={18} />
        </Link>
        <div className="w-10 h-10 rounded-xl flex items-center justify-center"
             style={{ background: 'linear-gradient(135deg, #004d24, #006633)' }}>
          <BookOpen size={20} className="text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-iss-dark">Inscriptions pédagogiques</h1>
          <p className="text-sm text-iss-gray">
            Automatiques — cet écran sert à en vérifier le résultat
          </p>
        </div>
      </div>

      <div className={`${CARTE} p-4`}>
        <div className="flex items-end gap-3 flex-wrap">
          <div style={{ minWidth: 220 }}>
            <label className="block text-xs font-semibold text-iss-dark mb-1.5">Classe</label>
            <select value={classeId ?? ''} className={SELECT}
                    onChange={e => setClasseId(e.target.value ? Number(e.target.value) : null)}>
              <option value="">— Choisir —</option>
              {classes.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
            </select>
          </div>
          {data && (
            <div className="pb-2.5 flex items-center gap-2">
              <Badge ton="bleu">
                {data.niveau} · {data.semestres.join(' + ') || 'aucun semestre'}
              </Badge>
              <Badge ton={incomplets.length ? 'ambre' : 'vert'}>
                {data.attendues} matière{data.attendues > 1 ? 's' : ''} attendue
                {data.attendues > 1 ? 's' : ''}
              </Badge>
            </div>
          )}
        </div>
      </div>

      {/* Un semestre non encore créé n'a pas de matières : la maquette y paraît
          complète alors qu'elle est seulement absente. Le dire évite de
          conclure trop vite. */}
      {data && data.semestres.length < 2 && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 flex items-start gap-2">
          <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
          <span>
            Un seul semestre existe pour cette année ({data.semestres.join(', ') || 'aucun'}).
            Les matières du semestre manquant seront rattachées d&apos;elles-mêmes à sa création.
          </span>
        </p>
      )}

      {!classeId ? (
        <div className={CARTE}>
          <Vide texte="Choisissez une classe pour vérifier sa maquette." />
        </div>
      ) : isLoading ? (
        <div className={CARTE}><LoadingSkeleton rows={5} cols={3} className="p-6" /></div>
      ) : !data?.lignes.length ? (
        <div className={CARTE}>
          <Vide texte="Aucun étudiant inscrit dans cette classe." />
        </div>
      ) : (
        <>
          {incomplets.length > 0 && (
            <div className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
              <span className="text-sm text-amber-800">
                {incomplets.length} étudiant{incomplets.length > 1 ? 's' : ''} n&apos;
                {incomplets.length > 1 ? 'ont' : 'a'} pas toute la maquette.
              </span>
              <button onClick={() => rattacher.mutate()} disabled={rattacher.isPending}
                      className="px-3 py-1.5 rounded-xl text-xs font-bold text-white flex items-center gap-1.5 disabled:opacity-50"
                      style={{ background: 'linear-gradient(135deg, #006633, #008844)' }}>
                {rattacher.isPending
                  ? <><Loader2 size={13} className="animate-spin" /> Rattachement…</>
                  : <><RefreshCw size={13} /> Rattacher les manquantes</>}
              </button>
            </div>
          )}

          <div className={`${CARTE} overflow-hidden`}>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-iss-gray uppercase tracking-wider border-b border-gray-100">
                  <th className="px-5 py-3 font-medium">Étudiant</th>
                  <th className="px-5 py-3 font-medium text-center">Matières</th>
                  <th className="px-5 py-3 font-medium">Manquantes</th>
                </tr>
              </thead>
              <tbody>
                {data.lignes.map(l => (
                  <tr key={l.inscription} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="px-5 py-3 font-semibold text-iss-dark">{l.etudiant}</td>
                    <td className="px-5 py-3 text-center">
                      {l.manquantes.length === 0
                        ? <span className="inline-flex items-center gap-1 text-emerald-700">
                            <Check size={13} /> {l.rattachees} / {l.attendues}
                          </span>
                        : <span className="text-amber-700 font-semibold">
                            {l.rattachees} / {l.attendues}
                          </span>}
                    </td>
                    <td className="px-5 py-3 text-iss-gray">
                      {l.manquantes.length === 0
                        ? '—'
                        : <span className="flex flex-wrap gap-1">
                            {l.manquantes.map(m => (
                              <Badge key={m} ton="ambre">{m}</Badge>
                            ))}
                          </span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
