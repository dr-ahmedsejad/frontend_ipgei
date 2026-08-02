'use client';

import { useEffect, useMemo, useState } from 'react';
import { History } from 'lucide-react';

import { Badge, CARTE, EnTetePage, Erreur, SELECT, Vide } from '../../_ui';
import { anneeParDefaut, libelleSemestreSession, typeSemestreSession } from '../../_annee';
import { BoutonPDF, GrilleConsultation } from '../_consultation';
import {
  useClassesSelect, useGrilleArchive, useSemestresAll, useVersionsArchive,
} from '@/lib/api/ipgei-hooks';
import { formatDate } from '@/lib/formatters';
import { NIVEAUX, type SeanceReelle } from '@/types/ipgei';

/**
 * Emplois du temps tels qu'ils étaient au moment où le suivi en a été tiré.
 *
 * Les séances vivent dans une table modifiée sur place : corriger une semaine
 * efface la version d'avant. Or c'est sur une version précise que les heures
 * ont été pointées, et parfois payées. Cet écran donne accès aux photographies
 * prises à chaque génération — y compris à plusieurs versions d'une même
 * semaine, quand elle a été régénérée.
 *
 * La grille est celle de « Emploi par classe », au pixel près : une archive
 * qui s'afficherait autrement que l'original ne permettrait pas la
 * comparaison, qui est sa seule raison d'être.
 */
export default function HistoriqueEdtPage() {
  const annee = anneeParDefaut();
  const typeSemestre = typeSemestreSession();

  const [niveau, setNiveau]     = useState('');
  const [classeId, setClasseId] = useState<number | null>(null);
  /** Prise de vue affichée, sous la forme `semaine__version`. */
  const [prise, setPrise]       = useState<string>('');

  const { data: classes = [] } = useClassesSelect({ annee_universitaire: annee, actif: true });
  const classesFiltrees = useMemo(
    () => (niveau ? classes.filter(c => c.niveau === niveau) : classes),
    [classes, niveau],
  );
  const classe = classes.find(c => c.id === classeId);

  const { data: semestres = [] } = useSemestresAll({ annee_universitaire: annee });
  const semestre = useMemo(
    () => semestres.find(s => classe && s.niveau === classe.niveau
                              && s.type_semestre === typeSemestre),
    [classe, semestres, typeSemestre],
  );

  const { data: versions = [], isLoading: chargeVersions, error } =
    useVersionsArchive(classeId, semestre?.id ?? null);

  // La plus récente d'office : c'est celle qu'on vient chercher neuf fois sur
  // dix, et un écran qui s'ouvre vide oblige à un clic pour rien.
  useEffect(() => {
    if (!versions.length) { setPrise(''); return; }
    setPrise(p => (versions.some(v => `${v.semaine}__${v.version}` === p)
      ? p
      : `${versions[0].semaine}__${versions[0].version}`));
  }, [versions]);

  const [semaineId, version] = prise
    ? prise.split('__').map(Number)
    : [null, null];
  const choisie = versions.find(
    v => v.semaine === semaineId && v.version === version);

  const { data: archivees = [], isLoading } =
    useGrilleArchive(semaineId, classeId, version);

  /**
   * Le composant de consultation attend des séances vivantes. L'archive en a
   * délibérément la forme — seul le type diffère, puisqu'elle ne pointe plus
   * vers le référentiel.
   */
  const seances = archivees as unknown as SeanceReelle[];

  const dateDeVue = (v?: { genere_le: string }) =>
    v ? formatDate(v.genere_le) : '';

  return (
    <div className="space-y-4">
      <EnTetePage
        icone={<History size={14} className="text-white" />}
        titre="Historique des emplois du temps"
        sousTitre={`${annee} · ${libelleSemestreSession()}`}
        actions={semaineId ? (
          <BoutonPDF
            chemin="/api/v1/ipgei/archives-edt/pdf/"
            params={{
              semaine: String(semaineId),
              classe:  String(classeId ?? ''),
              version: String(version ?? ''),
            }}
            nomDefaut={`Archive_${classe?.nom ?? 'classe'}`
              + `_S${choisie?.numero ?? ''}_v${version ?? ''}.pdf`}
          />
        ) : undefined}
      />

      <div className={`${CARTE} p-4 print:hidden`}>
        <div className="flex items-end gap-3 flex-wrap">
          <div style={{ minWidth: 150 }}>
            <label className="block text-xs font-semibold text-iss-dark mb-1.5">Niveau</label>
            <select value={niveau} className={SELECT}
                    onChange={e => { setNiveau(e.target.value); setClasseId(null); }}>
              <option value="">Tous</option>
              {NIVEAUX.map(n => <option key={n.value} value={n.value}>{n.value}</option>)}
            </select>
          </div>
          <div style={{ minWidth: 200 }}>
            <label className="block text-xs font-semibold text-iss-dark mb-1.5">Classe</label>
            <select value={classeId ?? ''} className={SELECT}
                    onChange={e => setClasseId(e.target.value ? Number(e.target.value) : null)}>
              <option value="">— Classe —</option>
              {classesFiltrees.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
            </select>
          </div>

          {/* Une seule liste pour la semaine ET la version : ce sont deux
              facettes d'une même chose — la prise de vue — et les séparer
              obligeait à deviner lesquelles se combinent réellement. */}
          <div style={{ minWidth: 320 }}>
            <label className="block text-xs font-semibold text-iss-dark mb-1.5">
              Version archivée
            </label>
            <select value={prise} className={SELECT} disabled={!versions.length}
                    onChange={e => setPrise(e.target.value)}>
              {!versions.length && <option value="">— Aucune archive —</option>}
              {versions.map(v => (
                <option key={`${v.semaine}__${v.version}`}
                        value={`${v.semaine}__${v.version}`}>
                  Semaine {v.numero}
                  {versions.filter(x => x.semaine === v.semaine).length > 1
                    ? ` — version ${v.version}` : ''}
                  {' · généré le '}{dateDeVue(v)}
                  {' · '}{v.nb_seances} séance{v.nb_seances > 1 ? 's' : ''}
                </option>
              ))}
            </select>
          </div>

          {semestre && (
            <div className="pb-2.5"><Badge ton="bleu">Semestre {semestre.code}</Badge></div>
          )}
        </div>
      </div>

      <Erreur erreur={error} />

      {/* Le document dit ce qu'il est. Ouvert à côté de l'emploi du temps
          courant, rien ne les distinguerait sans cette mention — alors qu'ils
          diffèrent souvent, ce qui est précisément l'intérêt de l'archive. */}
      {choisie && (
        <div className={`${CARTE} px-4 py-2.5`}>
          <span style={{ fontSize: 12, color: '#4b5563' }}>
            Emploi du temps <strong>tel qu'il a servi</strong> à la génération du
            suivi de la semaine {choisie.numero}, le {dateDeVue(choisie)}.
            {' '}Il n'a plus bougé depuis : les modifications faites après cette
            date figurent dans l'emploi du temps courant, pas ici.
          </span>
        </div>
      )}

      {!classeId ? (
        <div className={CARTE}>
          <Vide texte="Choisissez une classe pour consulter ses emplois du temps archivés." />
        </div>
      ) : !chargeVersions && !versions.length ? (
        <div className={CARTE}>
          <Vide texte={`Aucun emploi du temps archivé pour ${classe?.nom ?? 'cette classe'} : `
                     + `une archive est prise à chaque génération de suivi.`} />
        </div>
      ) : (
        <GrilleConsultation
          seances={seances}
          axe="classe"
          isLoading={isLoading || chargeVersions}
          titreImpression={`EMPLOI DU TEMPS ARCHIVÉ — ${classe?.nom ?? ''}`}
          sousTitresImpression={[
            [semestre && `Semestre ${semestre.code}`,
             choisie?.numero && `Semaine ${choisie.numero}`,
             choisie && `du ${formatDate(choisie.date_debut)} au ${formatDate(choisie.date_fin)}`,
            ].filter(Boolean).join('  ·  '),
            `Version ${version ?? ''} · générée le ${dateDeVue(choisie)}`,
            `Année universitaire ${annee}`,
          ]}
          vide="Cette prise de vue ne contient aucune séance."
        />
      )}
    </div>
  );
}
