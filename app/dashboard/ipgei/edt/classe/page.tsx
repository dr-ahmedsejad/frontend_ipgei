'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { CopyPlus, Users } from 'lucide-react';

import {
  BTN_PRIMAIRE, Badge, CARTE, DEGRADE, EnTetePage, Erreur, SELECT, Vide,
} from '../../_ui';
import { anneeParDefaut, libelleSemestreSession, typeSemestreSession } from '../../_annee';
import {
  BandeauCoherence, BoutonPDF, GrilleConsultation, SelecteurSemaine,
} from '../_consultation';
import {
  useClassesSelect, useEdtSemaine, useGrillePourClasse, useSemaines, useSemestresAll,
  useSousGroupes,
} from '@/lib/api/ipgei-hooks';
import { formatDate } from '@/lib/formatters';
import { NIVEAUX } from '@/types/ipgei';

/**
 * Emploi du temps d'une classe, en lecture seule et imprimable.
 *
 * Pendant de la vue « Semaine », qui sert à éditer : celle-ci est destinée à
 * l'affichage et à la distribution aux étudiants. C'est l'équivalent IPGEI de
 * l'« emploi du temps par filière » de SIGA — la prépa n'a pas de filières, la
 * classe est l'unité de planification.
 */
export default function EdtParClassePage() {
  const annee = anneeParDefaut();
  const typeSemestre = typeSemestreSession();

  const [niveau, setNiveau]       = useState('');
  const [classeId, setClasseId]   = useState<number | null>(null);
  const [semaineId, setSemaineId] = useState<number | null>(null);
  /** `''` = la classe entière et tous ses groupes ; sinon un sous-groupe. */
  const [plan, setPlan]           = useState<string>('');

  const { data: classes = [] } = useClassesSelect({ annee_universitaire: annee, actif: true });
  const classesFiltrees = useMemo(
    () => (niveau ? classes.filter(c => c.niveau === niveau) : classes),
    [classes, niveau],
  );
  const classe = classes.find(c => c.id === classeId);

  const { data: semestres = [] } = useSemestresAll({ annee_universitaire: annee });
  // Le semestre découle du niveau de la classe et de la période de session.
  const semestre = useMemo(
    () => semestres.find(s => classe && s.niveau === classe.niveau && s.type_semestre === typeSemestre),
    [classe, semestres, typeSemestre],
  );
  const { data: semaines = [] } = useSemaines(semestre?.id ?? null, classeId);

  const { data: toutesSeances = [], isLoading, error } = useEdtSemaine(classeId, semaineId);
  const { data: grille } = useGrillePourClasse(classeId, typeSemestre);
  const { data: sousGroupes = [] } = useSousGroupes(classeId);
  const semaine = semaines.find(s => s.id === semaineId);

  /**
   * Emploi du temps d'un sous-groupe = les séances de sa classe **plus** les
   * siennes.
   *
   * Un étudiant de G1 suit tous les cours en classe entière ; seuls les TP sont
   * dédoublés. Son emploi du temps se déduit donc de celui de la classe, il n'a
   * pas à être ressaisi — et surtout pas recopié en base : deux jeux de séances
   * pour un même cours doubleraient les heures dans le Suivi, l'Avancement et
   * les vacations.
   */
  const seances = useMemo(() => {
    if (!plan) return toutesSeances;
    const duGroupe = toutesSeances.filter(s => String(s.sous_groupe) === plan);
    // Une séance propre au groupe REMPLACE celle de la classe sur la même case :
    // sans ce retrait, l'étudiant verrait deux séances au même créneau.
    const occupees = new Set(duGroupe.map(s => `${s.jour}__${s.creneau}`));
    const deLaClasse = toutesSeances.filter(
      s => s.sous_groupe === null && !occupees.has(`${s.jour}__${s.creneau}`),
    );
    return [...deLaClasse, ...duGroupe];
  }, [toutesSeances, plan]);
  const nomPlan = plan
    ? (sousGroupes.find(sg => String(sg.id) === plan)?.libelle ?? '')
    : '';

  // Une grille type remplie mais aucune séance réelle : la duplication n'a pas
  // été lancée. C'est le cas le plus fréquent, et le moins deviné.
  const grilleRemplie = (grille?.nb_seances ?? 0) > 0;

  return (
    <div className="space-y-4">
      <EnTetePage
        icone={<Users size={14} className="text-white" />}
        titre="Emploi du temps par classe"
        sousTitre={`${annee} · ${libelleSemestreSession()}`}
        actions={classeId ? (
          <BoutonPDF
              chemin="/api/v1/ipgei/seances/pdf-classe/"
              params={{
                classe:  String(classeId),
                semaine: String(semaineId ?? ''),
                ...(plan ? { sous_groupe: plan } : {}),
              }}
            nomDefaut={`Emploi_${classe?.nom ?? 'classe'}`
              + `${nomPlan ? `_${nomPlan}` : ''}_S${semaine?.numero ?? ''}.pdf`}
            actif={!!semaineId}
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
                    onChange={e => {
                      setClasseId(e.target.value ? Number(e.target.value) : null);
                      setPlan('');
                    }}>
              <option value="">— Classe —</option>
              {classesFiltrees.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
            </select>
          </div>

          {/* Emploi du temps d'un sous-groupe : les cours de la classe s'y
              ajoutent d'office, seuls les TP de l'autre groupe sont retirés. */}
          {sousGroupes.length > 0 && (
            <div style={{ minWidth: 170 }}>
              <label className="block text-xs font-semibold text-iss-dark mb-1.5">Plan</label>
              <select value={plan} className={SELECT} onChange={e => setPlan(e.target.value)}>
                <option value="">Classe et tous ses groupes</option>
                {sousGroupes.map(sg => (
                  <option key={sg.id} value={sg.id}>Sous-groupe {sg.libelle}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold text-iss-dark mb-1.5">Semaine</label>
            <SelecteurSemaine semaines={semaines} semaineId={semaineId} onChange={setSemaineId} />
          </div>
          {semestre && (
            <div className="pb-2.5"><Badge ton="bleu">Semestre {semestre.code}</Badge></div>
          )}
          {nomPlan && (
            <div className="pb-2.5">
              <Badge ton="vert">
                {classe?.nom} — {nomPlan} · cours de la classe inclus
              </Badge>
            </div>
          )}
        </div>
      </div>

      <Erreur erreur={error} />

      {/* Avant le PDF : dire si ce qu'on s'apprête à imprimer correspond
          encore au suivi de cette semaine. */}
      {classeId && <BandeauCoherence semaine={semaine} />}

      {!classeId ? (
        <div className={CARTE}>
          <Vide texte="Choisissez une classe pour afficher son emploi du temps." />
        </div>
      ) : !isLoading && seances.length === 0 && grilleRemplie ? (
        <div className={CARTE}>
          <Vide
            texte={`La grille type de ${classe?.nom} contient ${grille?.nb_seances} séance(s), `
                 + `mais elle n'a pas encore été dupliquée sur les semaines du semestre.`}
            action={
              <Link href="/dashboard/ipgei/edt/grille" className={BTN_PRIMAIRE}
                    style={{ background: DEGRADE }}>
                <CopyPlus size={14} /> Dupliquer la grille sur le semestre
              </Link>
            }
          />
        </div>
      ) : (
        <GrilleConsultation
          seances={seances}
          axe="classe"
          isLoading={isLoading}
          titreImpression={
            `EMPLOI DU TEMPS — ${classe?.nom ?? ''}` +
            (nomPlan ? ` — sous-groupe ${nomPlan}` : '')
          }
          sousTitresImpression={[
            [semestre && `Semestre ${semestre.code}`,
             semaine?.numero && `Semaine ${semaine.numero}`,
             semaine && `du ${formatDate(semaine.date_debut)} au ${formatDate(semaine.date_fin)}`,
            ].filter(Boolean).join('  ·  '),
            `Année universitaire ${annee}`,
          ]}
          vide={`Aucune séance pour ${classe?.nom ?? 'cette classe'} : sa grille type est vide. `
              + `Renseignez-la dans « Gérer les emplois », puis dupliquez-la sur le semestre.`}
        />
      )}
    </div>
  );
}
