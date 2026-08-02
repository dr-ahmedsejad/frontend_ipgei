'use client';

import { useMemo, useState } from 'react';
import { DoorOpen } from 'lucide-react';

import { CARTE, EnTetePage, Erreur, SELECT, Vide } from '../../_ui';
import { anneeParDefaut, libelleSemestreSession, typeSemestreSession } from '../../_annee';
import { useReferentielsEDT } from '../_referentiels';
import { BoutonPDF, GrilleConsultation, SelecteurSemaine } from '../_consultation';
import { useEdtPublie, useSemaines, useSemestresAll } from '@/lib/api/ipgei-hooks';
import { formatDate } from '@/lib/formatters';

/**
 * Occupation d'une salle sur une semaine.
 *
 * L'usage courant n'est pas de lire ce qui s'y passe, mais de repérer ce qui
 * n'y est PAS : les cases vides sont les créneaux disponibles.
 */
export default function EdtParSallePage() {
  const annee = anneeParDefaut();
  const typeSemestre = typeSemestreSession();

  const [salleId, setSalleId]     = useState<number | null>(null);
  const [semaineId, setSemaineId] = useState<number | null>(null);

  const { salles } = useReferentielsEDT();
  const { data: semestres = [] } = useSemestresAll({ annee_universitaire: annee });

  // Une salle accueille indifféremment MPSI et MP : on couvre les deux niveaux.
  const semestresPeriode = useMemo(
    () => semestres.filter(s => s.type_semestre === typeSemestre),
    [semestres, typeSemestre],
  );
  const { data: semainesA = [] } = useSemaines(semestresPeriode[0]?.id ?? null);
  const { data: semainesB = [] } = useSemaines(semestresPeriode[1]?.id ?? null);
  const semaines = useMemo(
    () => [...semainesA, ...semainesB].sort((a, b) => a.date_debut.localeCompare(b.date_debut)),
    [semainesA, semainesB],
  );

  // Source : l'emploi du temps publié. Une salle réservée sur une grille en
  // préparation ne l'est pas encore : l'afficher ferait croire à une
  // occupation qui n'engage personne.
  const { data: seances = [], isLoading, error } =
    useEdtPublie(semaineId, { salle: salleId });
  const salle = salles.find(s => s.id === salleId);
  const semaine = semaines.find(s => s.id === semaineId);

  return (
    <div className="space-y-4">
      <EnTetePage
        icone={<DoorOpen size={14} className="text-white" />}
        titre="Occupation des salles"
        sousTitre={`${annee} · ${libelleSemestreSession()}`}
        actions={salleId ? (
          <BoutonPDF
            chemin="/api/v1/ipgei/archives-edt/pdf/"
            params={{ salle: String(salleId), semaine: String(semaineId ?? '') }}
            nomDefaut={`Occupation_${salle?.nom ?? 'salle'}_S${semaine?.numero ?? ''}.pdf`}
            actif={!!semaineId}
          />
        ) : undefined}
      />

      <div className={`${CARTE} p-4 print:hidden`}>
        <div className="flex items-end gap-3 flex-wrap">
          <div style={{ minWidth: 220 }}>
            <label className="block text-xs font-semibold text-iss-dark mb-1.5">Salle</label>
            <select value={salleId ?? ''} className={SELECT}
                    onChange={e => setSalleId(e.target.value ? Number(e.target.value) : null)}>
              <option value="">— Salle —</option>
              {salles.map(s => (
                <option key={s.id} value={s.id}>
                  {s.nom}{s.capacite ? ` (${s.capacite} places)` : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-iss-dark mb-1.5">Semaine</label>
            <SelecteurSemaine semaines={semaines} semaineId={semaineId} onChange={setSemaineId} />
          </div>
          <p className="text-xs text-iss-gray pb-3">
            Les cases vides sont les créneaux libres de cette salle.
          </p>
        </div>
      </div>

      <Erreur erreur={error} />

      {!salleId ? (
        <div className={CARTE}>
          <Vide texte="Choisissez une salle pour afficher son occupation." />
        </div>
      ) : (
        <GrilleConsultation
          seances={seances}
          axe="salle"
          isLoading={isLoading}
          titreImpression={`OCCUPATION DE LA SALLE — ${salle?.nom ?? ''}`}
          sousTitresImpression={[
            [libelleSemestreSession(),
             semaine?.numero && `Semaine ${semaine.numero}`,
             semaine && `du ${formatDate(semaine.date_debut)} au ${formatDate(semaine.date_fin)}`,
            ].filter(Boolean).join('  ·  '),
            `Année universitaire ${annee}`,
          ]}
          vide={`${salle?.nom ?? 'Cette salle'} est libre toute la semaine.`}
        />
      )}
    </div>
  );
}
