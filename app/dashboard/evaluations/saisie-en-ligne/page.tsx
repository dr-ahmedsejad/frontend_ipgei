'use client';

import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Download, Edit3, Loader2 } from 'lucide-react';

import { apiFetch, apiFetchBlob } from '@/lib/api';
import { ToastContainer, useToast } from '@/components/ui/Toast';
import { formatDateTime } from '@/lib/formatters';

/**
 * Saisie de notes faite en ligne — la table d'attente de la direction.
 *
 * Ce sont des BROUILLONS, jamais des notes officielles : le portail est un
 * miroir, et rien de ce qui s'y écrit ne fait autorité. On exporte le classeur,
 * on ressaisit en local, et cette étape humaine est le garde-fou.
 *
 * L'export marque les lignes « exporté » — c'est ainsi qu'on sait, la semaine
 * suivante, ce qui a déjà été repris.
 */

interface Brouillon {
  id:                 number;
  prof_nom:           string;
  etudiant_matricule: string;
  etudiant_nom:       string;
  classe_nom:         string;
  matiere_code:       string;
  matiere_intitule:   string;
  semestre_code:      string;
  annee_universitaire: string;
  type_note:          string;
  numero:             number;
  valeur:             string | null;
  statut:             'brouillon' | 'exporte';
  date_modification:  string;
}

export default function SaisieEnLignePage() {
  const toast = useToast();
  const [statut, setStatut] = useState('');
  const [annee, setAnnee]   = useState('');

  // Le filtre par SESSION a disparu avec la couche LMD : un brouillon vise
  // désormais une note IPGEI, qui relève d'un semestre et d'une année.
  const filtres: Record<string, string> = {};
  if (statut) filtres.statut              = statut;
  if (annee)  filtres.annee_universitaire = annee;

  const { data: brouillons = [], isLoading } = useQuery({
    queryKey: ['saisie-en-ligne', 'list', filtres] as const,
    queryFn:  () => {
      const requete = new URLSearchParams(filtres).toString();
      return apiFetch<Brouillon[]>(
        `/api/v1/saisie-en-ligne/${requete ? `?${requete}` : ''}`);
    },
  });

  const exporter = useMutation({
    mutationFn: () => apiFetchBlob('/api/v1/saisie-en-ligne/export/', filtres),
    onSuccess: (blob) => {
      const url = URL.createObjectURL(blob);
      const lien = document.createElement('a');
      lien.href = url;
      lien.download = 'saisie-en-ligne.xlsx';
      lien.click();
      URL.revokeObjectURL(url);
      toast.success('Classeur téléchargé — ces brouillons sont marqués « exporté ».');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Échec de l’export.'),
  });

  const enAttente = brouillons.filter(b => b.statut === 'brouillon').length;

  return (
    <div className="space-y-5 max-w-6xl">
      <ToastContainer toasts={toast.toasts} onClose={toast.removeToast} />

      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
               style={{ background: 'linear-gradient(135deg,#004d24,#006633)' }}>
            <Edit3 size={16} className="text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-iss-dark">Saisie de notes en ligne</h1>
            <p className="text-xs text-iss-gray">
              Brouillons déposés par les enseignants depuis le portail. À reprendre
              en local — ils ne valent pas note officielle.
            </p>
          </div>
        </div>

        <button onClick={() => exporter.mutate()}
                disabled={exporter.isPending || brouillons.length === 0}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm
                           font-semibold text-white disabled:opacity-60"
                style={{ background: 'linear-gradient(135deg,#006633,#008844)' }}>
          {exporter.isPending
            ? <Loader2 size={15} className="animate-spin" />
            : <Download size={15} />}
          Exporter en Excel
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-card border border-gray-100 p-4
                      flex gap-3 flex-wrap items-end">
        <div>
          <label className="block text-xs font-semibold text-iss-dark mb-1.5">
            Année universitaire
          </label>
          <input value={annee} onChange={e => setAnnee(e.target.value)}
                 placeholder="Toutes les années"
                 className="text-sm border border-gray-200 rounded-xl px-3 py-2"
                 style={{ minWidth: 200 }} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-iss-dark mb-1.5">État</label>
          <select value={statut} onChange={e => setStatut(e.target.value)}
                  className="text-sm border border-gray-200 rounded-xl px-3 py-2"
                  style={{ minWidth: 160 }}>
            <option value="">Tous</option>
            <option value="brouillon">Brouillons</option>
            <option value="exporte">Déjà exportés</option>
          </select>
        </div>
        <p className="text-xs text-iss-gray pb-2">
          {brouillons.length} ligne(s){enAttente > 0 && ` · ${enAttente} pas encore exportée(s)`}
        </p>
      </div>

      <div className="bg-white rounded-2xl shadow-card border border-gray-100 overflow-hidden">
        {isLoading ? (
          <p className="px-5 py-6 text-sm text-iss-gray">Lecture…</p>
        ) : brouillons.length === 0 ? (
          <p className="px-5 py-8 text-sm text-iss-gray text-center">
            Aucune saisie en ligne pour ce filtre.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-center text-xs font-semibold text-iss-gray uppercase
                               tracking-wide border-b border-gray-100">
                  <th className="px-4 py-2.5">Étudiant</th>
                  <th className="px-4 py-2.5">Matière</th>
                  <th className="px-4 py-2.5">Classe</th>
                  <th className="px-4 py-2.5">Semestre</th>
                  <th className="px-4 py-2.5">Type</th>
                  <th className="px-4 py-2.5">Note</th>
                  <th className="px-4 py-2.5">Enseignant</th>
                  <th className="px-4 py-2.5">État</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {brouillons.map(ligne => (
                  <tr key={ligne.id} className="hover:bg-gray-50/60">
                    <td className="px-4 py-2">
                      <div className="text-sm font-semibold text-iss-dark">
                        {ligne.etudiant_nom}
                      </div>
                      <div className="text-xs text-iss-gray">{ligne.etudiant_matricule}</div>
                    </td>
                    <td className="px-4 py-2 text-xs text-iss-gray">
                      <b className="text-iss-dark">{ligne.matiere_code}</b> {ligne.matiere_intitule}
                    </td>
                    <td className="px-4 py-2 text-xs">{ligne.classe_nom}</td>
                    <td className="px-4 py-2 text-center text-xs whitespace-nowrap">
                      {ligne.semestre_code} · {ligne.annee_universitaire}
                    </td>
                    <td className="px-4 py-2 text-center text-xs font-semibold">
                      {ligne.type_note.toUpperCase()}
                      {(ligne.type_note === 'ds' || ligne.type_note === 'exam')
                        && ` ${ligne.numero}`}
                    </td>
                    <td className="px-4 py-2 text-center text-sm font-bold tabular-nums text-[#006633]">
                      {ligne.valeur ?? '—'}
                    </td>
                    <td className="px-4 py-2 text-xs text-iss-gray">{ligne.prof_nom}</td>
                    <td className="px-4 py-2 text-center">
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-lg border ${
                        ligne.statut === 'brouillon'
                          ? 'bg-amber-50 text-amber-700 border-amber-200'
                          : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                        {ligne.statut === 'brouillon' ? 'brouillon' : 'exporté'}
                      </span>
                      <p className="text-[11px] text-iss-gray mt-0.5">
                        {formatDateTime(ligne.date_modification)}
                      </p>
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
