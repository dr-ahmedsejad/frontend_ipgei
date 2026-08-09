'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, FileSearch, Printer } from 'lucide-react';

import { Badge, CARTE, Chargement, Erreur, SELECT } from '../../_ui';
import { useAnneeIPGEI } from '../../_annee';
import ChoixInscription from '../_choix-inscription';
import ReleveNotesVue from '../_releve-notes-vue';
import { useReleveAnnuel } from '@/lib/api/ipgei-hooks';
import type { Inscription } from '@/types/ipgei';

/**
 * Consultation des notes — à l'écran, sans rien émettre.
 *
 * Contrôler la moyenne d'un étudiant ne devrait pas obliger à délivrer une
 * pièce : chaque relevé édité prend un numéro de série au registre et existe
 * dès lors dans la nature. Un agent qui vérifie dix dossiers en émettait dix.
 * Ici on lit, on n'émet pas.
 *
 * Repris du dispositif SIGA (Documents → Consultation des relevés) : même
 * gabarit — en-tête à pastille, carte de sélection, bandeau d'identité puis le
 * relevé consolidé —, transposé aux objets IPGEI.
 */
export default function ConsultationNotesPage() {
  const { annee, setAnnee, options } = useAnneeIPGEI();
  const [inscription, setInscription] = useState<Inscription | null>(null);

  const { data: releve, isLoading, error } = useReleveAnnuel(inscription?.id ?? null);

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/ipgei/documents"
              className="p-2 rounded-xl text-iss-gray hover:bg-gray-50 hover:text-[#006633] transition-colors">
          <ArrowLeft size={18} />
        </Link>
        <div className="flex items-center gap-2 flex-1">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center"
               style={{ background: 'linear-gradient(135deg,#004d24,#006633)' }}>
            <FileSearch size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-iss-dark">Consultation des relevés</h1>
            <p className="text-sm text-iss-gray">
              Choisir un étudiant pour voir ses notes par semestre — sans impression.
            </p>
          </div>
        </div>
        {/* L'année reste ici : sans elle, la liste des inscrits mêlerait les
            promotions, et le relevé consulté ne serait pas celui qu'on croit. */}
        <select value={annee}
                onChange={e => { setAnnee(e.target.value); setInscription(null); }}
                className={SELECT} style={{ width: 130 }}>
          {options.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>

      <div className={`${CARTE} p-4`}>
        <ChoixInscription annee={annee} choisi={inscription} onChoisir={setInscription} />
      </div>

      {inscription && (
        <div className={`${CARTE} p-5`}>
          <Erreur erreur={error} />

          {isLoading ? <Chargement texte="Lecture du relevé…" /> : releve && (
            <>
              <div className="mb-4 pb-3 border-b border-gray-100 flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-iss-dark">{releve.etudiant.nom}</span>
                <span className="font-mono text-xs text-iss-gray">
                  {releve.etudiant.matricule}
                </span>
                <span className="text-xs text-iss-gray">· {releve.classe}</span>
                <span className="ml-auto flex items-center gap-3 text-xs">
                  <span className="text-iss-gray">Moyenne annuelle</span>
                  <span className="font-bold text-iss-dark tabular-nums">
                    {releve.moyenne === null ? '—' : Number(releve.moyenne).toFixed(2)}/20
                  </span>
                  <Badge ton={releve.valide ? 'vert' : 'rouge'}>
                    {releve.valide ? 'Année validée' : 'Sous le seuil'}
                  </Badge>
                </span>
              </div>

              <ReleveNotesVue releve={releve} seuil={releve.seuil} />

              {/* La consultation ne délivre rien : quand une pièce est
                  réellement due, on passe par l'émission, qui la numérote et
                  la scelle. */}
              <p className="mt-4 pt-3 border-t border-gray-100 text-xs text-iss-gray">
                Pour délivrer un relevé signé et vérifiable,{' '}
                <Link href="/dashboard/ipgei/documents/generer"
                      className="text-[#006633] font-medium hover:underline inline-flex items-center gap-1">
                  <Printer size={12} /> émettez le document
                </Link>{' '}
                — il recevra alors son numéro au registre.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
