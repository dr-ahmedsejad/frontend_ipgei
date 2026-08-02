'use client';

import { useMemo, useState } from 'react';
import { Presentation } from 'lucide-react';

import { CARTE, EnTetePage, Erreur, SELECT, Vide } from '../../_ui';
import { anneeParDefaut, libelleSemestreSession, typeSemestreSession } from '../../_annee';
import { useReferentielsEDT } from '../_referentiels';
import { BoutonPDF, GrilleConsultation, SelecteurSemaine } from '../_consultation';
import { useEdtPublie, useSemaines, useSemestresAll } from '@/lib/api/ipgei-hooks';
import { formatDate } from '@/lib/formatters';

/**
 * Emploi du temps d'un enseignant, toutes classes confondues.
 *
 * Les séances viennent de `prof`, qui porte l'enseignant EFFECTIF : après une
 * permutation, l'écran montre donc ce que l'intéressé assure réellement — c'est
 * aussi cette base qui sert au calcul de charge.
 */
export default function EdtParEnseignantPage() {
  const annee = anneeParDefaut();
  const typeSemestre = typeSemestreSession();

  const [profId, setProfId]       = useState<number | null>(null);
  const [semaineId, setSemaineId] = useState<number | null>(null);

  const { profs } = useReferentielsEDT();
  const { data: semestres = [] } = useSemestresAll({ annee_universitaire: annee });

  // Un enseignant intervient en MPSI comme en MP : on réunit les semaines des
  // deux niveaux pour la période de session, sans quoi la moitié de son
  // service resterait invisible.
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

  // Source : l'emploi du temps publié — celui sur lequel l'enseignant est
  // pointé, et donc payé. Afficher la grille en préparation lui montrerait des
  // heures qui ne comptent pas encore.
  const { data: seances = [], isLoading, error } =
    useEdtPublie(semaineId, { prof: profId });
  const prof = profs.find(p => p.id === profId);
  const semaine = semaines.find(s => s.id === semaineId);

  return (
    <div className="space-y-4">
      <EnTetePage
        icone={<Presentation size={14} className="text-white" />}
        titre="Emploi du temps par enseignant"
        sousTitre={`${annee} · ${libelleSemestreSession()}`}
        actions={profId ? (
          <BoutonPDF
            chemin="/api/v1/ipgei/archives-edt/pdf/"
            params={{ prof: String(profId), semaine: String(semaineId ?? '') }}
            nomDefaut={`Emploi_${prof?.nom ?? 'enseignant'}_S${semaine?.numero ?? ''}.pdf`}
            actif={!!semaineId}
          />
        ) : undefined}
      />

      <div className={`${CARTE} p-4 print:hidden`}>
        <div className="flex items-end gap-3 flex-wrap">
          <div style={{ minWidth: 260 }}>
            <label className="block text-xs font-semibold text-iss-dark mb-1.5">Enseignant</label>
            <select value={profId ?? ''} className={SELECT}
                    onChange={e => setProfId(e.target.value ? Number(e.target.value) : null)}>
              <option value="">— Enseignant —</option>
              {profs.map(p => <option key={p.id} value={p.id}>{p.nom} ({p.type})</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-iss-dark mb-1.5">Semaine</label>
            <SelecteurSemaine semaines={semaines} semaineId={semaineId} onChange={setSemaineId} />
          </div>
        </div>
      </div>

      <Erreur erreur={error} />

      {!profId ? (
        <div className={CARTE}>
          <Vide texte="Choisissez un enseignant pour afficher son emploi du temps." />
        </div>
      ) : (
        <GrilleConsultation
          seances={seances}
          axe="prof"
          isLoading={isLoading}
          titreImpression={`EMPLOI DU TEMPS — ${prof?.nom ?? ''}`}
          sousTitresImpression={[
            [libelleSemestreSession(),
             semaine?.numero && `Semaine ${semaine.numero}`,
             semaine && `du ${formatDate(semaine.date_debut)} au ${formatDate(semaine.date_fin)}`,
            ].filter(Boolean).join('  ·  '),
            `Année universitaire ${annee}`,
          ]}
          vide={`Aucune séance pour ${prof?.nom ?? 'cet enseignant'} sur cette semaine.`}
        />
      )}
    </div>
  );
}
