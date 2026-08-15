'use client';

import Link from 'next/link';
import { Check, ChevronRight } from 'lucide-react';

import { CARTE } from '../../_ui';
import {
  useApercuPassage, useConcoursCNIM, useDeliberation, useNiveauxCursus,
} from '@/lib/api/ipgei-hooks';
import type { Deliberation } from '@/types/ipgei';

/**
 * Le fil du parcours de deuxième année.
 *
 * Le cursus MP se joue en cinq actes — jury annuel, rattrapage, concours, PV
 * final, réinscriptions — répartis sur trois écrans et deux entrées de menu.
 * Chaque écran était juste, et pourtant on ne savait jamais où l'on en était :
 * « je vois pas la délibération après le rattrapage », « comment on saisit le
 * résultat du concours ». C'étaient des questions de navigation, pas de calcul.
 *
 * Ce bandeau y répond une fois pour toutes : chaque acte, son état réel lu dans
 * les données, et le lien pour s'y rendre. Il ne s'affiche qu'en deuxième année
 * — la première n'a ni rattrapage ni concours, et un fil à deux étapes pour
 * elle serait un ornement.
 */

/** Un acte du parcours, tel qu'il s'affiche. */
interface Etape {
  cle:      string;
  titre:    string;
  /** L'état RÉEL, en une ligne : « 3 en attente », « validé », « sans objet ». */
  etat:     string;
  ton:      'fait' | 'encours' | 'attente' | 'inactif';
  href?:    string;
  /** L'acte auquel on se trouve : il se souligne au lieu de s'offrir en lien. */
  courante?: boolean;
}

const TONS: Record<Etape['ton'], { point: string; texte: string }> = {
  fait:    { point: '#006633', texte: 'text-[#006633]' },
  encours: { point: '#0369a1', texte: 'text-sky-700' },
  attente: { point: '#d97706', texte: 'text-amber-700' },
  inactif: { point: '#cbd5e1', texte: 'text-iss-gray' },
};

export function FilParcours({ deliberation }: { deliberation: Deliberation }) {
  // Le rang ne se déduit pas d'un code de niveau : c'est le référentiel qui
  // dit si MP est une deuxième année.
  const { data: niveaux = [] } = useNiveauxCursus(true);
  const rang = niveaux.find(n => n.code === deliberation.niveau)?.rang;
  const deuxiemeAnnee = rang === 2;

  const semestriel = deliberation.portee === 'semestre';
  const rattrapage = deliberation.portee === 'rattrapage';

  // Tout le fil se lit depuis le jury ANNUEL : c'est lui qui porte la
  // promotion. Sur un jury de rattrapage, on remonte par `jury_source`.
  const idAnnuel = rattrapage ? deliberation.jury_source
                 : deliberation.portee === 'annuelle' ? deliberation.id
                 : null;
  const { data: annuelCharge } = useDeliberation(
    idAnnuel && idAnnuel !== deliberation.id ? idAnnuel : null);
  const annuel = idAnnuel === deliberation.id ? deliberation : annuelCharge;

  // Le rattrapage se lit sur LUI-MÊME, jamais sur la page où l'on se trouve.
  // Déduit du jury courant, il n'était connu que lorsqu'on l'avait sous les
  // yeux : depuis le jury annuel, un rattrapage validé s'affichait « ouvert »,
  // et la coche n'apparaissait qu'une fois dessus. Un fil de parcours qui
  // change selon l'endroit d'où on le regarde ne sert à rien.
  const idRattrapage = deliberation.portee === 'rattrapage'
    ? deliberation.id
    : annuelCharge?.jury_rattrapage ?? deliberation.jury_rattrapage ?? null;
  const { data: rattrapageCharge } = useDeliberation(
    idRattrapage && idRattrapage !== deliberation.id ? idRattrapage : null);
  const juryR = idRattrapage === deliberation.id ? deliberation : rattrapageCharge;

  const actif = deuxiemeAnnee && !semestriel && idAnnuel != null;

  const { data: concours } = useConcoursCNIM(
    actif ? deliberation.annee_universitaire : '', deliberation.niveau);
  const { data: passage } = useApercuPassage(
    idAnnuel, Boolean(actif && annuel?.est_verrouillee));

  // Un jury de semestre n'est pas une étape du cursus : il arrête des notes,
  // il ne prononce rien. Lui coller le fil laisserait croire le contraire.
  if (!actif || !annuel) return null;

  const base = '/dashboard/ipgei/deliberations';
  const lienAnnuel = `${base}/${idAnnuel}`;

  // ── Acte 1 : le jury annuel ────────────────────────────────────────────────
  const etapes: Etape[] = [{
    cle:   'annuel',
    titre: 'Jury annuel',
    etat:  annuel.est_verrouillee ? 'validé'
         : annuel.statut === 'calculee' ? 'calculé, à valider' : 'à calculer',
    ton:   annuel.est_verrouillee ? 'fait' : 'encours',
    href:  lienAnnuel,
    courante: deliberation.portee === 'annuelle',
  }];

  // ── Acte 2 : le rattrapage ────────────────────────────────────────────────
  // Trois cas, et un seul dépend de la page : celui qu'on souligne.
  //   · pas de second jury  → à convoquer, ou sans objet ;
  //   · ouvert              → ses notes restent à saisir et à valider ;
  //   · validé              → la seconde session a prononcé.
  const attendus = annuel.nb_au_rattrapage;
  etapes.push({
    cle:   'rattrapage',
    titre: 'Rattrapage',
    etat:  !annuel.est_verrouillee ? 'après le jury annuel'
         : juryR == null
           ? (attendus > 0 ? `${attendus} à convoquer` : 'sans objet')
         : juryR.est_verrouillee ? 'validé'
         : 'notes à saisir',
    ton:   !annuel.est_verrouillee ? 'inactif'
         : juryR == null ? (attendus > 0 ? 'attente' : 'inactif')
         : juryR.est_verrouillee ? 'fait' : 'encours',
    href:  juryR != null ? `${base}/${juryR.id}`
         : attendus > 0 ? lienAnnuel : undefined,
    courante: rattrapage,
  });

  // ── Acte 3 : le concours ──────────────────────────────────────────────────
  // `en_attente` : sans résultat connu. `a_appliquer` : résultat su, situation
  // pas encore posée — deux réserves distinctes, et l'utilisateur agit sur la
  // seconde d'un clic.
  //
  // Le concours est passé par NIVEAU, pas par classe : ses compteurs couvrent
  // MP A et MP B ensemble, là où ce jury ne siège que pour l'une. On le dit
  // plutôt que de laisser croire à un décompte de la classe.
  const candidats = concours?.lignes.length ?? 0;
  const portee = deliberation.classe ? ` (niveau ${deliberation.niveau})` : '';
  etapes.push({
    cle:   'concours',
    titre: 'Concours CNIM',
    etat:  !candidats ? 'personne n’y est autorisé'
         : concours?.en_attente ? `${concours.en_attente} sans résultat${portee}`
         : concours?.a_appliquer ? `${concours.a_appliquer} à poser${portee}`
         : `résultats appliqués${portee}`,
    ton:   !candidats ? 'inactif'
         : concours?.en_attente ? 'attente'
         : concours?.a_appliquer ? 'encours' : 'fait',
    href:  candidats
      ? '/dashboard/ipgei/notes/cnim'
        + `?annee=${encodeURIComponent(deliberation.annee_universitaire)}`
        + `&niveau=${encodeURIComponent(deliberation.niveau)}`
        + `&retour=${idAnnuel}`
      : undefined,
  });

  // ── Acte 4 : le PV final ──────────────────────────────────────────────────
  const enSuspens = (concours?.en_attente ?? 0) + (concours?.a_appliquer ?? 0);
  etapes.push({
    cle:   'pv-final',
    titre: 'PV final',
    etat:  !annuel.est_verrouillee ? 'après le jury annuel'
         : enSuspens ? 'incomplet tant que le concours court'
         : 'éditable',
    ton:   !annuel.est_verrouillee ? 'inactif' : enSuspens ? 'attente' : 'fait',
    href:  annuel.est_verrouillee ? lienAnnuel : undefined,
  });

  // ── Acte 5 : les réinscriptions ───────────────────────────────────────────
  const aInscrire = passage?.candidats.filter(c => !c.deja_inscrit).length ?? 0;
  const dejaFait  = passage?.candidats.filter(c => c.deja_inscrit).length ?? 0;
  etapes.push({
    cle:   'reinscriptions',
    titre: `Réinscriptions${passage ? ` ${passage.annee_cible}` : ''}`,
    etat:  !annuel.est_verrouillee ? 'après le jury annuel'
         : aInscrire ? `${aInscrire} à ouvrir`
         : dejaFait ? `${dejaFait} ouverte(s)`
         : 'personne ne repart',
    ton:   !annuel.est_verrouillee ? 'inactif'
         : aInscrire ? 'attente' : dejaFait ? 'fait' : 'inactif',
    href:  annuel.est_verrouillee ? lienAnnuel : undefined,
  });

  return (
    <div className={`${CARTE} px-4 py-3`}>
      <div className="flex items-center gap-1 overflow-x-auto">
        {etapes.map((etape, index) => (
          <div key={etape.cle} className="flex items-center gap-1 shrink-0">
            {index > 0 && (
              <ChevronRight size={14} className="text-gray-300 shrink-0" />
            )}
            <Contenu etape={etape} />
          </div>
        ))}
      </div>
    </div>
  );
}

function Contenu({ etape }: { etape: Etape }) {
  const tons = TONS[etape.ton];
  const corps = (
    <>
      <span className="flex items-center gap-1.5">
        {etape.ton === 'fait' ? (
          <Check size={12} style={{ color: tons.point }} />
        ) : (
          <span className="inline-block rounded-full"
                style={{ width: 7, height: 7, background: tons.point }} />
        )}
        <span className={`text-xs font-semibold ${
          etape.courante ? 'text-iss-dark' : 'text-iss-gray'}`}>
          {etape.titre}
        </span>
      </span>
      <span className={`block text-[11px] pl-[13px] ${tons.texte}`}>
        {etape.etat}
      </span>
    </>
  );

  // L'étape courante ne se propose pas en lien vers elle-même : elle se
  // souligne, et c'est ce qui situe le lecteur.
  const habillage = 'px-2.5 py-1 rounded-lg block'
    + (etape.courante ? ' bg-[#006633]/[0.06]' : '');

  if (!etape.href || etape.courante) {
    return <span className={habillage}>{corps}</span>;
  }
  return (
    <Link href={etape.href}
          className={`${habillage} hover:bg-gray-50 transition-colors`}>
      {corps}
    </Link>
  );
}
