'use client';

import Link from 'next/link';
import {
  BookOpen, CalendarDays, GraduationCap, Repeat, Scale, UserCheck, Users,
} from 'lucide-react';

import {
  CARTE, Chargement, EnTetePage, Erreur, SELECT, Tuile, VERT,
} from './_ui';
import { useAnneeIPGEI } from './_annee';
import { useResumeIPGEI } from '@/lib/api/ipgei-hooks';

const RACCOURCIS = [
  { href: '/dashboard/ipgei/classes',       label: 'Classes & sous-groupes', icone: Users,        aide: 'MPSI A/B…, MP A/B…, groupes de TP' },
  { href: '/dashboard/ipgei/inscriptions',  label: 'Inscriptions',           icone: UserCheck,    aide: 'Rattacher les étudiants aux classes' },
  { href: '/dashboard/ipgei/matieres',      label: 'Matières',               icone: BookOpen,     aide: 'Coefficients, volumes, pondération' },
  { href: '/dashboard/ipgei/notes',         label: 'Saisie des notes',       icone: GraduationCap,aide: 'DS et examens en nombre libre' },
  { href: '/dashboard/ipgei/deliberations', label: 'Délibération',           icone: Scale,        aide: 'Seuil, décisions, validation du jury' },
  { href: '/dashboard/ipgei/edt/semaine',   label: 'Emploi du temps',        icone: CalendarDays, aide: 'Grille type dupliquée par semaine' },
  { href: '/dashboard/ipgei/permutations',  label: 'Permutations',           icone: Repeat,       aide: 'Enseignants et changements de classe' },
];

export default function TableauBordIPGEI() {
  const { annee, setAnnee, options } = useAnneeIPGEI();
  const { data, isLoading, error } = useResumeIPGEI(annee || undefined);

  return (
    <div className="space-y-5 max-w-6xl">
      <EnTetePage
        icone={<GraduationCap size={14} className="text-white" />}
        titre="IPGEI — Classes préparatoires"
        sousTitre="Cursus MPSI → MP, quatre semestres, délibération et emploi du temps hebdomadaire."
        actions={
          <select value={annee} onChange={e => setAnnee(e.target.value)}
                  className={SELECT} style={{ width: 170 }}>
            {options.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        }
      />

      <Erreur erreur={error} />

      {isLoading && !data ? <Chargement /> : data && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Tuile label="Étudiants" valeur={data.effectifs.total}
                   detail={`${data.effectifs.mpsi} en MPSI · ${data.effectifs.mp} en MP`}
                   icone={<UserCheck size={22} />} />
            <Tuile label="Classes" valeur={data.classes.total}
                   detail={`${data.classes.mpsi} MPSI · ${data.classes.mp} MP`}
                   icone={<Users size={22} />} />
            <Tuile label="Matières actives" valeur={data.matieres}
                   detail={`${data.semestres} semestre${data.semestres > 1 ? 's' : ''} ouverts`}
                   icone={<BookOpen size={22} />} />
            <Tuile label="Permutations en attente" valeur={data.permutations_en_attente}
                   detail={data.permutations_en_attente > 0
                     ? 'Une validation du directeur est requise'
                     : 'Aucune demande en cours'}
                   icone={<Repeat size={22} />} />
          </div>

          <div className={`${CARTE} p-5`}>
            <h2 className="text-sm font-bold text-iss-dark mb-3">Accès rapide</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {RACCOURCIS.map(({ href, label, icone: Icone, aide }) => (
                <Link key={href} href={href}
                      className="flex items-start gap-3 p-3 rounded-xl border border-gray-100 hover:border-[#006633] hover:bg-gray-50 transition-all">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                       style={{ background: 'rgba(0,102,51,0.08)' }}>
                    <Icone size={15} style={{ color: VERT }} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-iss-dark">{label}</p>
                    <p className="text-xs text-iss-gray leading-snug">{aide}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          {data.effectifs.total === 0 && (
            <div className={`${CARTE} p-5`} style={{ borderLeft: `3px solid ${VERT}` }}>
              <h2 className="text-sm font-bold text-iss-dark mb-1">Démarrer l&apos;année {annee}</h2>
              <p className="text-sm text-iss-gray leading-relaxed">
                Aucun étudiant n&apos;est encore inscrit. L&apos;ordre habituel :
                créer les <Link href="/dashboard/ipgei/classes" className="font-semibold text-[#006633] underline">classes</Link>,
                vérifier les <Link href="/dashboard/ipgei/matieres" className="font-semibold text-[#006633] underline">matières</Link> et
                leur pondération, puis rattacher les
                {' '}<Link href="/dashboard/ipgei/inscriptions" className="font-semibold text-[#006633] underline">étudiants</Link>.
                Les semestres et leurs semaines se règlent dans
                {' '}<Link href="/dashboard/ipgei/parametres" className="font-semibold text-[#006633] underline">Paramètres</Link>.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
