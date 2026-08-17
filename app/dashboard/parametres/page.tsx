'use client';

import Link from 'next/link';
import {
  Settings, Calendar, BookOpen, DollarSign,
  Building, Layers, Clock, MapPin, ArrowRight,
  Sun, CalendarDays, Moon, GraduationCap, Globe,
  MessageSquareWarning,
} from 'lucide-react';

/**
 * Accueil du paramétrage — les référentiels du système, en cartes.
 *
 * Ces douze blocs tenaient auparavant douze groupes dans la barre latérale,
 * dont huit n'ouvraient que sur une seule page : plus du tiers du menu
 * permanent pour des réglages qu'on touche trois fois l'an. Ils sont ici, sous
 * une entrée unique — et la page a la place de dire à quoi chacun sert, ce que
 * le menu ne permettait pas.
 *
 * `liens` porte les destinations qui n'existent NULLE PART ailleurs : la
 * génération des semaines et l'ajout d'une semaine à la main n'ont aucun
 * équivalent dans l'écran de liste. Les autres écrans ont leur propre bouton
 * « Ajouter » : le répéter ici ferait deux chemins pour un même geste.
 */
const BLOCS = [
  {
    href: '/dashboard/parametres/cursus',
    icon: GraduationCap,
    label: 'Cursus prépa',
    desc: "Niveaux du cursus, semestres de l'année, règles de délibération et signataires",
    color: '#006633',
  },
  {
    href: '/dashboard/parametres/institutions',
    icon: Globe,
    label: 'Institutions',
    desc: 'Établissements gérés, en-tête et cachet des documents',
    color: '#006633',
  },
  {
    href: '/dashboard/parametres/annees',
    icon: Calendar,
    label: 'Années universitaires',
    desc: "Ouvrir une année, la clore, désigner l'année courante",
    color: '#006633',
  },
  {
    href: '/dashboard/parametres/niveaux',
    icon: Layers,
    label: 'Niveaux',
    desc: "Niveaux d'études du socle et leur rang dans le cursus",
    color: '#006633',
  },
  {
    href: '/dashboard/parametres/semaines',
    icon: CalendarDays,
    label: 'Semaines',
    desc: 'Calendrier pédagogique : semaines de cours, vacances, examens',
    color: '#006633',
    liens: [
      { href: '/dashboard/parametres/semaines/generer', label: 'Générer' },
      { href: '/dashboard/parametres/semaines/ajouter', label: 'Ajouter à la main' },
    ],
  },
  {
    href: '/dashboard/parametres/creneaux',
    icon: Clock,
    label: 'Créneaux horaires',
    desc: 'Plages horaires sur lesquelles se posent les séances',
    color: '#006633',
  },
  {
    href: '/dashboard/parametres/jours',
    icon: Sun,
    label: 'Jours',
    desc: 'Jours ouvrés de la semaine et leur ordre',
    color: '#B8960C',
  },
  {
    href: '/dashboard/parametres/seances',
    icon: BookOpen,
    label: 'Types de séance',
    desc: 'CM, TD, TP — chacun avec son taux et sa couleur',
    color: '#006633',
  },
  {
    href: '/dashboard/parametres/salles',
    icon: MapPin,
    label: 'Salles',
    desc: 'Salles et amphithéâtres, capacité et disponibilité',
    color: '#006633',
  },
  {
    href: '/dashboard/parametres/departements',
    icon: Building,
    label: 'Départements',
    desc: 'Groupes du socle, miroir des classes de la prépa',
    color: '#006633',
  },
  {
    href: '/dashboard/parametres/paiements',
    icon: DollarSign,
    label: 'Taux de paiement',
    desc: 'Taux horaires des vacations, par type de séance et par date',
    color: '#C82020',
  },
  {
    href: '/dashboard/parametres/periodes-reclamation',
    icon: MessageSquareWarning,
    label: 'Périodes de réclamation',
    desc: "Fenêtres pendant lesquelles l'étudiant peut contester une note",
    color: '#006633',
  },
  {
    href: '/dashboard/parametres/ramadan',
    icon: Moon,
    label: 'Périodes Ramadan',
    desc: 'Dates du mois, qui resserrent les créneaux de la journée',
    color: '#006633',
  },
];

export default function ParametresPage() {
  return (
    <div className="space-y-8 max-w-6xl">

      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #64748b, #94a3b8)' }}>
            <Settings size={16} className="text-white" />
          </div>
          <h1 className="text-xl font-bold text-iss-dark">Paramétrage</h1>
        </div>
        <p className="text-sm text-iss-gray ml-10">
          Les référentiels sur lesquels s&apos;appuie tout le reste : le calendrier, les salles,
          les taux, le cursus.
        </p>
      </div>

      {/* Warning banner */}
      <div className="rounded-2xl p-5 border flex items-start gap-3"
        style={{ background: 'rgba(229,192,24,0.07)', borderColor: 'rgba(229,192,24,0.3)' }}>
        <Settings size={18} style={{ color: '#E5C018' }} className="shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-iss-dark">Zone d&apos;administration</p>
          <p className="text-xs text-iss-gray mt-0.5 leading-relaxed">
            Ce qui se règle ici vaut pour toutes les années et toutes les classes. Une semaine
            retirée du calendrier, un taux modifié, et les écrans qui s&apos;en servent suivent
            aussitôt.
          </p>
        </div>
      </div>

      {/* Blocs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {BLOCS.map(({ href, icon: Icon, label, desc, color, liens }) => (
          <div key={href}
            className="group bg-white rounded-2xl p-5 shadow-card border border-gray-100 hover:border-transparent hover:shadow-card-lg transition-all duration-300 hover:-translate-y-0.5 flex flex-col">
            <Link href={href} className="flex-1">
              <div className="w-10 h-10 rounded-2xl flex items-center justify-center mb-4 transition-transform group-hover:scale-110"
                style={{ background: `${color}12` }}>
                <Icon size={18} style={{ color }} />
              </div>
              <h3 className="font-semibold text-iss-dark text-sm mb-1">{label}</h3>
              <p className="text-xs text-iss-gray leading-relaxed mb-4">{desc}</p>
            </Link>
            <div className="flex items-center gap-3 flex-wrap">
              <Link href={href}
                className="flex items-center gap-1 text-xs font-medium"
                style={{ color }}>
                Gérer <ArrowRight size={12} className="transition-transform group-hover:translate-x-1" />
              </Link>
              {/* Raccourcis vers les gestes sans équivalent dans l'écran de liste. */}
              {liens?.map(lien => (
                <Link key={lien.href} href={lien.href}
                  className="text-xs text-iss-gray hover:text-iss-primary hover:underline">
                  {lien.label}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
