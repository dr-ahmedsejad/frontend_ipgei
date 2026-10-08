'use client';

import { useMemo, useState } from 'react';
import { DoorOpen } from 'lucide-react';

import { CARTE, EnTetePage, Erreur, SELECT, Vide } from '../../_ui';
import { anneeParDefaut, libelleSemestreSession, typeSemestreSession } from '../../_annee';
import { useReferentielsEDT } from '../_referentiels';
import {
  BoutonPDF, GrilleConsultation, SelecteurSemaineParDate, grouperSemainesParDate,
  libelleDatesSemaine,
} from '../_consultation';
import { useEdtPublie, useSemaines, useSemestresAll } from '@/lib/api/ipgei-hooks';

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
  // Les semaines de cette DATE, tous semestres de la période confondus : une
  // salle accueille indifféremment les deux niveaux.
  const [semaineCle, setSemaineCle] = useState<string | null>(null);

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
    useEdtPublie(semaineCle, { salle: salleId });
  const salle = salles.find(s => s.id === salleId);
  const semaine = useMemo(
    () => grouperSemainesParDate(semaines).find(e => e.cle === semaineCle),
    [semaines, semaineCle],
  );

  return (
    <div className="space-y-4">
      <EnTetePage
        icone={<DoorOpen size={14} className="text-white" />}
        titre="Occupation des salles"
        sousTitre={`${annee} · ${libelleSemestreSession()}`}
        actions={salleId ? (
          <BoutonPDF
            chemin="/api/v1/ipgei/archives-edt/pdf/"
            params={{ salle: String(salleId), semaine: semaineCle ?? '' }}
            nomDefaut={`Occupation_${salle?.nom ?? 'salle'}_${semaine?.date_debut ?? ''}.pdf`}
            actif={!!semaineCle}
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
            <SelecteurSemaineParDate semaines={semaines} valeur={semaineCle}
                                     onChange={setSemaineCle} />
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
            [semaine?.numero && `Semaine ${semaine.numero}`,
             semaine && libelleDatesSemaine(semaine.date_debut, semaine.date_fin),
             semaine?.semestres.length
               ? `Semestre${semaine.semestres.length > 1 ? 's' : ''} `
                 + semaine.semestres.join(' · ')
               : '',
            ].filter(Boolean).join('  ·  '),
            `Année universitaire ${annee}`,
          ]}
          vide={`${salle?.nom ?? 'Cette salle'} est libre toute la semaine.`}
        />
      )}
    </div>
  );
}
