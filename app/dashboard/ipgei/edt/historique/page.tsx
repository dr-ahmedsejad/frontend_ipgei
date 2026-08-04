'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, History } from 'lucide-react';

import { Badge, CARTE, EnTetePage, Erreur, SELECT, Vide } from '../../_ui';
import { anneeParDefaut, libelleSemestreSession, typeSemestreSession } from '../../_annee';
import { BTN_FLECHE, BoutonPDF, GrilleConsultation } from '../_consultation';
import {
  useClassesSelect, useGrilleArchive, useSemestresAll, useVersionsArchive, useOptionsNiveaux,
} from '@/lib/api/ipgei-hooks';
import { formatDate } from '@/lib/formatters';

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
  const optionsNiveaux = useOptionsNiveaux();
  const annee = anneeParDefaut();
  const typeSemestre = typeSemestreSession();

  const [niveau, setNiveau]     = useState('');
  const [classeId, setClasseId] = useState<number | null>(null);
  const [semaineId, setSemaineId] = useState<number | null>(null);
  /** `null` = la dernière version de la semaine affichée. */
  const [version, setVersion]     = useState<number | null>(null);

  const { data: classes = [] } = useClassesSelect({ annee_universitaire: annee, actif: true });
  const classesFiltrees = useMemo(
    () => (niveau ? classes.filter(c => c.niveau === niveau) : classes),
    [classes, niveau],
  );
  const classe = classes.find(c => c.id === classeId);

  const { data: semestres = [] } = useSemestresAll({ annee_universitaire: annee });
  const semestre = useMemo(
    () => semestres.find(s => classe && s.niveaux.includes(classe.niveau)
                              && s.type_semestre === typeSemestre),
    [classe, semestres, typeSemestre],
  );

  const { data: versions = [], isLoading: chargeVersions, error } =
    useVersionsArchive(classeId, semestre?.id ?? null);

  /**
   * Semaines archivées, dans l'ordre du calendrier.
   *
   * Les flèches défilent là-dessus : plusieurs versions d'une même semaine ne
   * doivent pas obliger à appuyer deux fois pour passer à la suivante. Choisir
   * une version reste un geste à part, et ne se pose que là où il y en a
   * plusieurs.
   */
  const semainesArchivees = useMemo(() => {
    const vues = new Map<number, { id: number; numero: number; debut: string | null }>();
    for (const v of versions) {
      if (!vues.has(v.semaine)) {
        vues.set(v.semaine, { id: v.semaine, numero: v.numero, debut: v.date_debut });
      }
    }
    return [...vues.values()].sort((a, b) => a.numero - b.numero);
  }, [versions]);

  /** Prises de vue de la semaine affichée, de la plus récente à la plus ancienne. */
  const versionsSemaine = useMemo(
    () => versions.filter(v => v.semaine === semaineId),
    [versions, semaineId],
  );

  // S'ouvre sur la dernière semaine archivée : c'est celle qu'on vient
  // vérifier, et un écran qui s'ouvre vide coûte un clic pour rien.
  useEffect(() => {
    if (!semainesArchivees.length) { setSemaineId(null); return; }
    setSemaineId(id => (semainesArchivees.some(s => s.id === id)
      ? id
      : semainesArchivees[semainesArchivees.length - 1].id));
  }, [semainesArchivees]);

  // Changer de semaine ramène sur sa version la plus récente : conserver
  // « v2 » en passant à une semaine qui n'en a qu'une n'affichait rien.
  useEffect(() => {
    setVersion(v => (versionsSemaine.some(x => x.version === v) ? v : null));
  }, [versionsSemaine]);

  const index   = semainesArchivees.findIndex(s => s.id === semaineId);
  const choisie = versionsSemaine.find(v => v.version === version)
    ?? versionsSemaine[0];

  const { data: archivees = [], isLoading } =
    useGrilleArchive(semaineId, classeId, choisie?.version ?? null);

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
              version: String(choisie?.version ?? ''),
            }}
            nomDefaut={`Archive_${classe?.nom ?? 'classe'}`
              + `_S${choisie?.numero ?? ''}_v${choisie?.version ?? ''}.pdf`}
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
              {optionsNiveaux.map(n => <option key={n.value} value={n.value}>{n.value}</option>)}
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

          <div>
            <label className="block text-xs font-semibold text-iss-dark mb-1.5">Semaine</label>
            <div className="flex items-center gap-1">
              <button onClick={() => semainesArchivees[index - 1]
                        && setSemaineId(semainesArchivees[index - 1].id)}
                      disabled={index <= 0} title="Semaine précédente"
                      className={BTN_FLECHE}>
                <ChevronLeft size={14} />
              </button>
              <select value={semaineId ?? ''} className={SELECT} style={{ minWidth: 180 }}
                      disabled={!semainesArchivees.length}
                      onChange={e => setSemaineId(e.target.value ? Number(e.target.value) : null)}>
                {!semainesArchivees.length && <option value="">— Aucune archive —</option>}
                {semainesArchivees.map(s => (
                  <option key={s.id} value={s.id}>
                    S{s.numero}{s.debut ? ` · ${formatDate(s.debut)}` : ''}
                  </option>
                ))}
              </select>
              <button onClick={() => semainesArchivees[index + 1]
                        && setSemaineId(semainesArchivees[index + 1].id)}
                      disabled={index < 0 || index >= semainesArchivees.length - 1}
                      title="Semaine suivante"
                      className={BTN_FLECHE}>
                <ChevronRight size={14} />
              </button>
            </div>
          </div>

          {/* Le choix de version ne se pose que là où il y en a plusieurs :
              une liste à un seul élément fait croire à un réglage à faire. */}
          {versionsSemaine.length > 1 && (
            <div style={{ minWidth: 230 }}>
              <label className="block text-xs font-semibold text-iss-dark mb-1.5">
                Version
              </label>
              <select value={version ?? versionsSemaine[0]?.version ?? ''} className={SELECT}
                      onChange={e => setVersion(Number(e.target.value))}>
                {versionsSemaine.map(v => (
                  <option key={v.version} value={v.version}>
                    Version {v.version} · {dateDeVue(v)} · {v.nb_seances} séance
                    {v.nb_seances > 1 ? 's' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

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
          seances={archivees}
          axe="classe"
          isLoading={isLoading || chargeVersions}
          titreImpression={`EMPLOI DU TEMPS ARCHIVÉ — ${classe?.nom ?? ''}`}
          sousTitresImpression={[
            [semestre && `Semestre ${semestre.code}`,
             choisie?.numero && `Semaine ${choisie.numero}`,
             choisie && `du ${formatDate(choisie.date_debut)} au ${formatDate(choisie.date_fin)}`,
            ].filter(Boolean).join('  ·  '),
            `Version ${choisie?.version ?? ''} · générée le ${dateDeVue(choisie)}`,
            `Année universitaire ${annee}`,
          ]}
          vide="Cette prise de vue ne contient aucune séance."
        />
      )}
    </div>
  );
}
