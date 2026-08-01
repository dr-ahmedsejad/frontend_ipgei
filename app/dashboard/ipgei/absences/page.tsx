'use client';

import { useState } from 'react';
import { Search, Trash2, UserX } from 'lucide-react';

import { ConfirmModal } from '@/components/ConfirmModal';
import { Pagination } from '@/components/Pagination';
import {
  Badge, CARTE, Chargement, EnTetePage, Erreur, SELECT, Toast, Tuile, Vide,
} from '../_ui';
import { useAnneeIPGEI } from '../_annee';
import {
  useAbsenceMutations, useAbsences, useClassesSelect, useSemestresAll,
} from '@/lib/api/ipgei-hooks';
import { STATUTS_ABSENCE, type AbsenceSeance } from '@/types/ipgei';

const TON = { absent: 'rouge', retard: 'ambre', justifiee: 'bleu' } as const;

export default function AbsencesIPGEIPage() {
  const { annee, setAnnee, options } = useAnneeIPGEI();
  const [page, setPage]           = useState(1);
  const [recherche, setRecherche] = useState('');
  const [classe, setClasse]       = useState('');
  const [semestre, setSemestre]   = useState('');
  const [statut, setStatut]       = useState('');

  const { data: classes = [] }   = useClassesSelect({ annee_universitaire: annee, actif: true });
  const { data: semestres = [] } = useSemestresAll({ annee_universitaire: annee });

  const { data, isLoading, error } = useAbsences({
    page,
    search: recherche || undefined,
    inscription__classe: classe ? Number(classe) : undefined,
    seance__semaine__semestre: semestre ? Number(semestre) : undefined,
    statut: statut || undefined,
  });
  const { remove } = useAbsenceMutations();

  const [aSupprimer, setASupprimer] = useState<AbsenceSeance | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const notifier = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2800); };

  const absences = data?.results ?? [];
  const total    = data?.count ?? 0;

  const compte = (valeur: string) => absences.filter(a => a.statut === valeur).length;

  return (
    <div className="space-y-5 max-w-6xl">
      <EnTetePage
        icone={<UserX size={14} className="text-white" />}
        titre="Absences"
        sousTitre="Saisie par exception : seules les absences sont enregistrées, la présence est la règle."
      />

      <div className={`${CARTE} px-4 py-3`} style={{ borderLeft: '3px solid #006633' }}>
        <p className="text-xs text-iss-gray leading-relaxed">
          Cet écran consulte et corrige les absences déjà saisies. L&apos;appel se fait
          séance par séance depuis <strong>Emploi du temps → icône appel</strong> sur la séance.
        </p>
      </div>

      <Erreur erreur={error} />

      <div className="grid gap-4 sm:grid-cols-4">
        <Tuile label="Enregistrées (filtre)" valeur={total} />
        <Tuile label="Absences" valeur={compte('absent')} detail="sur la page courante" />
        <Tuile label="Retards" valeur={compte('retard')} detail="sur la page courante" />
        <Tuile label="Justifiées" valeur={compte('justifiee')} detail="sur la page courante" />
      </div>

      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-iss-gray pointer-events-none" />
          <input value={recherche} onChange={e => { setRecherche(e.target.value); setPage(1); }}
                 placeholder="Nom ou matricule…"
                 className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm bg-white focus:outline-none focus:border-[#006633] transition-all" />
        </div>
        <select value={annee} onChange={e => { setAnnee(e.target.value); setPage(1); }}
                className={SELECT} style={{ width: 140 }}>
          {options.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <select value={classe} onChange={e => { setClasse(e.target.value); setPage(1); }}
                className={SELECT} style={{ width: 160 }}>
          <option value="">Toutes les classes</option>
          {classes.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
        </select>
        <select value={semestre} onChange={e => { setSemestre(e.target.value); setPage(1); }}
                className={SELECT} style={{ width: 150 }}>
          <option value="">Tous les semestres</option>
          {semestres.map(s => <option key={s.id} value={s.id}>{s.code}</option>)}
        </select>
        <select value={statut} onChange={e => { setStatut(e.target.value); setPage(1); }}
                className={SELECT} style={{ width: 170 }}>
          <option value="">Tous les statuts</option>
          {STATUTS_ABSENCE.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </div>

      <div className={`${CARTE} overflow-hidden`}>
        {isLoading && !data ? <Chargement /> : absences.length === 0 ? (
          <Vide texte="Aucune absence enregistrée pour ces filtres — ce qui signifie assiduité complète." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold text-iss-gray uppercase tracking-wide border-b border-gray-100">
                  <th className="px-4 py-3">Étudiant</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Créneau</th>
                  <th className="px-4 py-3">Matière</th>
                  <th className="px-4 py-3">Statut</th>
                  <th className="px-4 py-3">Justificatif</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {absences.map(a => (
                  <tr key={a.id}>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-iss-dark">{a.etudiant_nom}</div>
                      <div className="text-xs text-iss-gray">{a.etudiant_matricule}</div>
                    </td>
                    <td className="px-4 py-3 text-iss-gray whitespace-nowrap">
                      {a.date_seance ? new Date(a.date_seance).toLocaleDateString('fr-FR') : '—'}
                    </td>
                    <td className="px-4 py-3 text-iss-gray whitespace-nowrap">{a.creneau_libelle}</td>
                    <td className="px-4 py-3 font-semibold text-iss-dark">{a.matiere_code}</td>
                    <td className="px-4 py-3"><Badge ton={TON[a.statut]}>{a.statut_display}</Badge></td>
                    <td className="px-4 py-3 text-iss-gray text-xs">{a.justificatif || '—'}</td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => setASupprimer(a)} title="Retirer (rendre présent)"
                              className="p-2 rounded-lg text-iss-gray hover:bg-red-50 hover:text-red-600 transition-colors">
                        <Trash2 size={13} />
                      </button>
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
        title="Retirer l'absence"
        message={aSupprimer
          ? `Retirer l'absence de ${aSupprimer.etudiant_nom} du ${aSupprimer.date_seance ?? ''} ? L'étudiant redevient présent sur cette séance.`
          : ''}
        onConfirm={() => aSupprimer && remove.mutate(aSupprimer.id, {
          onSuccess: () => { notifier('Absence retirée'); setASupprimer(null); },
          onError:   () => setASupprimer(null),
        })}
        onCancel={() => setASupprimer(null)}
        loading={remove.isPending}
      />

      <Toast message={toast} />
    </div>
  );
}
