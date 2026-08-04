'use client';

import Link from 'next/link';
import {
  ArrowLeft, CalendarDays, CalendarRange, ChevronRight, Clock, GraduationCap,
  Layers, SlidersHorizontal,
} from 'lucide-react';

import { CARTE, EnTetePage } from '@/app/dashboard/ipgei/_ui';
import { useAnneeIPGEI } from '@/app/dashboard/ipgei/_annee';
import {
  useNiveauxCursus, useParametresIPGEI, useSemestresAll,
} from '@/lib/api/ipgei-hooks';

/**
 * Sommaire du paramétrage du cursus, rubrique des paramètres généraux.
 *
 * Ces réglages tenaient sur une seule page, empilés : des domaines aux rythmes
 * très différents — les niveaux ne bougent qu'à l'ouverture d'une filière, le
 * calendrier à chaque rentrée, la grille horaire presque jamais — et un écran
 * qu'il fallait parcourir de bout en bout pour trouver la ligne à changer.
 * Chacun a maintenant sa page, et ce sommaire dit où en est chaque réglage sans
 * avoir à l'ouvrir.
 *
 * Les rubriques voisines pointent vers les écrans généraux : le calendrier et
 * la grille horaire sont communs à tout l'établissement, le cursus les emploie
 * sans en tenir un double.
 */
export default function ParametresIPGEIPage() {
  const { annee } = useAnneeIPGEI();
  const { data: niveaux = [] }   = useNiveauxCursus();
  const { data: semestres = [] } = useSemestresAll({ annee_universitaire: annee });
  const { data: parametres }     = useParametresIPGEI();

  const actifs   = niveaux.filter(n => n.actif).length;
  const ouverts  = semestres.filter(s => !s.est_cloture).length;
  const reprises = semestres.reduce((n, s) => n + (s.nb_semaines_generees ?? 0), 0);

  // Ce qui se règle ici, propre au cursus.
  const rubriques = [
    {
      href:  '/dashboard/parametres/cursus/niveaux',
      icone: Layers,
      titre: 'Niveaux du cursus',
      texte: "Années d'étude, droit au redoublement, décisions ouvertes au jury.",
      etat:  `${actifs} niveau${actifs > 1 ? 'x' : ''} actif${actifs > 1 ? 's' : ''}`,
    },
    {
      href:  '/dashboard/parametres/cursus/semestres',
      icone: CalendarRange,
      titre: 'Semestres',
      texte: "Ouverture de l'année, dates de début, clôture de la saisie.",
      etat:  semestres.length
        ? `${ouverts} / ${semestres.length} ouvert${semestres.length > 1 ? 's' : ''} en ${annee}`
        : `Aucun semestre en ${annee}`,
    },
    {
      href:  '/dashboard/parametres/cursus/deliberation',
      icone: SlidersHorizontal,
      titre: 'Règles de délibération',
      texte: 'Seuil de validation, plafond de rattrapage, droit au redoublement.',
      etat:  parametres ? `Seuil ${Number(parametres.seuil_validation).toFixed(2)} / 20` : '—',
    },
    {
      href:  '/dashboard/parametres/semaines?retour=cursus',
      icone: CalendarDays,
      titre: 'Calendrier des semaines',
      texte: "Semaines de l'année, vacances et examens — commun à l'établissement.",
      etat:  reprises
        ? `${reprises} semaine(s) reprises dans les semestres de ${annee}`
        : `Aucune semaine reprise en ${annee}`,
    },
    {
      // L'écran général, et non un doublon : celui d'IPGEI n'éditait que la
      // durée, alors que la grille horaire se gère entièrement — créer un
      // créneau, l'ordonner, l'activer ou le retirer du service.
      href:  '/dashboard/parametres/creneaux?retour=cursus',
      icone: Clock,
      titre: 'Grille horaire',
      texte: "Créneaux et durées, base du calcul de la charge d'enseignement.",
      etat:  "Commune à l'établissement",
    },
  ];

  return (
    <div className="space-y-5 max-w-5xl">
      <Link href="/dashboard/parametres"
            className="inline-flex items-center gap-1.5 text-sm text-iss-gray hover:text-[#006633] transition-colors">
        <ArrowLeft size={14} /> Paramètres
      </Link>

      <EnTetePage
        icone={<GraduationCap size={14} className="text-white" />}
        titre="Cursus prépa"
        sousTitre="Ce qui définit le cursus, et les réglages communs sur lesquels il s'appuie."
      />

      <div className="grid gap-4 sm:grid-cols-2">
        {rubriques.map(({ href, icone: Icone, titre, texte, etat }) => (
          <Link key={href} href={href}
                className={`${CARTE} p-5 flex items-start gap-4 hover:border-[#006633]/40 transition-colors`}>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                 style={{ background: 'linear-gradient(135deg,#004d24,#006633)' }}>
              <Icone size={18} className="text-white" />
            </div>
            <div className="flex-1 min-w-0 space-y-1">
              <p className="text-sm font-bold text-iss-dark">{titre}</p>
              <p className="text-xs text-iss-gray leading-relaxed">{texte}</p>
              <p className="text-[11px] font-semibold text-[#006633]">{etat}</p>
            </div>
            <ChevronRight size={16} className="text-iss-gray flex-shrink-0 mt-1" />
          </Link>
        ))}
      </div>
    </div>
  );
}
