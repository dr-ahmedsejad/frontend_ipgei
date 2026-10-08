'use client';

import { useMemo, useState } from 'react';
import { Presentation } from 'lucide-react';

import { CARTE, EnTetePage, Erreur, Vide } from '../../_ui';
import { ChampRecherche } from '../../_champ-recherche';
import { anneeParDefaut } from '../../_annee';
import { useSemainesDeLAnnee } from '../_semaines-classe';
import { useReferentielsEDT } from '../_referentiels';
import {
  BoutonPDF, GrilleConsultation, SelecteurSemaineParDate, grouperSemainesParDate,
  libelleDatesSemaine,
} from '../_consultation';
import { useEdtPublie } from '@/lib/api/ipgei-hooks';

/** Minuscules sans accents : « Béchir » se trouve en tapant « bechir ». */
const sansAccent = (texte: string) =>
  texte.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();

/**
 * Emploi du temps d'un enseignant, toutes classes confondues.
 *
 * Les séances viennent de `prof`, qui porte l'enseignant EFFECTIF : après une
 * permutation, l'écran montre donc ce que l'intéressé assure réellement — c'est
 * aussi cette base qui sert au calcul de charge.
 */
export default function EdtParEnseignantPage() {
  const annee = anneeParDefaut();

  const [profId, setProfId]       = useState<number | null>(null);
  // Les identifiants des semaines de cette DATE, « 12,19 » : une par semestre
  // concerné, réunies en une seule entrée.
  const [semaineCle, setSemaineCle] = useState<string | null>(null);
  const [recherche, setRecherche] = useState('');

  const { profs } = useReferentielsEDT();
  // Un enseignant intervient en MPSI comme en MP, et les deux années ne sont
  // pas toujours au même point : on prend TOUTES les semaines de l'année, sans
  // filtrer sur une période, sans quoi la moitié de son service disparaîtrait
  // de l'écran le jour où les MP passent en S4.
  const semaines = useSemainesDeLAnnee(annee);

  // Source : l'emploi du temps publié — celui sur lequel l'enseignant est
  // pointé, et donc payé. Afficher la grille en préparation lui montrerait des
  // heures qui ne comptent pas encore.
  const { data: seances = [], isLoading, error } =
    useEdtPublie(semaineCle, { prof: profId });
  // La liste des enseignants est déjà chargée : on filtre ici plutôt que de
  // repasser par le serveur à chaque lettre. Les accents sont ignorés — on ne
  // tape pas « Béchir » avec son accent quand on cherche vite.
  const propositions = useMemo(() => {
    const cherche = sansAccent(recherche);
    return profs
      .filter(p => !cherche || sansAccent(p.nom).includes(cherche))
      .slice(0, 50)
      .map(p => ({ id: String(p.id), label: p.nom, detail: p.type }));
  }, [profs, recherche]);

  const prof = profs.find(p => p.id === profId);
  const semaine = useMemo(
    () => grouperSemainesParDate(semaines).find(e => e.cle === semaineCle),
    [semaines, semaineCle],
  );

  return (
    <div className="space-y-4">
      <EnTetePage
        icone={<Presentation size={14} className="text-white" />}
        titre="Emploi du temps par enseignant"
        sousTitre={semaine?.semestres.length
          ? `${annee} · semestre${semaine.semestres.length > 1 ? 's' : ''} `
            + semaine.semestres.join(' · ')
          : annee}
        actions={profId ? (
          <BoutonPDF
            chemin="/api/v1/ipgei/archives-edt/pdf/"
            params={{ prof: String(profId), semaine: semaineCle ?? '' }}
            nomDefaut={`Emploi_${prof?.nom ?? 'enseignant'}_${semaine?.date_debut ?? ''}.pdf`}
            actif={!!semaineCle}
          />
        ) : undefined}
      />

      <div className={`${CARTE} p-4 print:hidden`}>
        <div className="flex items-end gap-3 flex-wrap">
          <div style={{ minWidth: 300 }}>
            <label className="block text-xs font-semibold text-iss-dark mb-1.5">Enseignant</label>
            {/* Autocomplétion, et non plus un menu déroulant : l'établissement
                compte des dizaines d'enseignants, et les faire défiler pour en
                trouver un prenait plus de temps que d'en taper trois lettres. */}
            <ChampRecherche
              value={profId ? String(profId) : ''}
              propositions={propositions}
              onChange={valeur => setProfId(valeur ? Number(valeur) : null)}
              onSaisie={setRecherche}
              placeholder="Nom de l'enseignant…"
              vide="Aucun enseignant ne correspond" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-iss-dark mb-1.5">Semaine</label>
            <SelecteurSemaineParDate semaines={semaines} valeur={semaineCle}
                                     onChange={setSemaineCle} />
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
            [semaine?.numero && `Semaine ${semaine.numero}`,
             semaine && libelleDatesSemaine(semaine.date_debut, semaine.date_fin),
             semaine?.semestres.length
               ? `Semestre${semaine.semestres.length > 1 ? 's' : ''} `
                 + semaine.semestres.join(' · ')
               : '',
            ].filter(Boolean).join('  ·  '),
            `Année universitaire ${annee}`,
          ]}
          vide={`Aucune séance pour ${prof?.nom ?? 'cet enseignant'} sur cette semaine.`}
        />
      )}
    </div>
  );
}
