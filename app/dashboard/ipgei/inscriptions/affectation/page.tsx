'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Users } from 'lucide-react';

import {
  BTN_SECONDAIRE, Badge, CARTE, Chargement, EnTetePage, Erreur, SELECT, Toast, Vide,
} from '../../_ui';
import { useAnneeIPGEI } from '../../_annee';
import {
  useClassesSelect, useInscriptionMutations, useInscriptions,
} from '@/lib/api/ipgei-hooks';
import type { Inscription } from '@/types/ipgei';

/**
 * Répartition des inscrits en attente vers les classes.
 *
 * On inscrit d'abord dans la classe d'attente du niveau — à la rentrée, on
 * ignore encore combien de classes ouvrir et comment équilibrer. L'inscrit y
 * reçoit déjà sa maquette et ses frais ; ce qui lui manque est le groupe où il
 * suivra les cours, et c'est cet écran qui le lui donne.
 *
 * Tant qu'il attend, il reste hors des emplois du temps, du suivi et des
 * listes d'appel : la classe d'attente est marquée conteneur au socle.
 */
export default function AffectationPage() {
  const { annee, setAnnee, options } = useAnneeIPGEI();
  const [toast, setToast] = useState<string | null>(null);
  const notifier = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2800); };

  return (
    <div className="space-y-5 max-w-5xl">
      <Link href="/dashboard/ipgei/inscriptions"
            className="inline-flex items-center gap-1.5 text-sm text-iss-gray hover:text-[#006633] transition-colors">
        <ArrowLeft size={14} /> Inscriptions
      </Link>

      <EnTetePage
        icone={<Users size={14} className="text-white" />}
        titre="Affectation aux classes"
        sousTitre="Répartir les inscrits en attente. Notes, absences et frais suivent l'étudiant."
        actions={
          <select value={annee} onChange={e => setAnnee(e.target.value)}
                  className={SELECT} style={{ width: 140 }}>
            {options.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        }
      />

      <ListeEnAttente annee={annee} onNotifier={notifier} />
      <Toast message={toast} />
    </div>
  );
}

function ListeEnAttente({ annee, onNotifier }: {
  annee: string; onNotifier: (m: string) => void;
}) {
  const { data, isLoading, error } = useInscriptions({
    page: 1, annee_universitaire: annee || '__aucune__',
    en_attente: true, actif: true,
  });
  const { data: classes = [] } = useClassesSelect({ annee_universitaire: annee, actif: true });
  const { affecter } = useInscriptionMutations();

  const [erreur, setErreur] = useState<string | null>(null);
  const attente = useMemo(() => data?.results ?? [], [data]);

  // Effectif de chaque classe réelle : on répartit à vue, sans avoir à
  // rouvrir l'écran des classes pour savoir laquelle est la plus chargée.
  const { data: affectes } = useInscriptions({
    page: 1, annee_universitaire: annee || '__aucune__',
    en_attente: false, actif: true, page_size: 500,
  } as never);
  const effectifs = useMemo(() => {
    const compte = new Map<number, number>();
    for (const i of affectes?.results ?? []) {
      compte.set(i.classe, (compte.get(i.classe) ?? 0) + 1);
    }
    return compte;
  }, [affectes]);

  const poser = (inscription: Inscription, classe: number) => {
    setErreur(null);
    affecter.mutate({ id: inscription.id, classe }, {
      onSuccess: () => onNotifier(`${inscription.etudiant_nom} affecté(e)`),
      onError:   (e) => setErreur(e instanceof Error ? e.message : 'Erreur'),
    });
  };

  if (isLoading && !data) return <div className={CARTE}><Chargement /></div>;

  return (
    <div className={CARTE}>
      <div className="px-5 pt-5 pb-3">
        <h2 className="text-sm font-bold text-iss-dark">
          {attente.length} inscrit{attente.length > 1 ? 's' : ''} en attente
        </h2>
        <p className="text-xs text-iss-gray">
          Un inscrit en attente est déjà rattaché à sa maquette et à ses frais.
          Il n&apos;apparaît ni dans les emplois du temps ni dans les listes d&apos;appel
          tant qu&apos;il n&apos;a pas de classe.
        </p>
      </div>

      <Erreur erreur={error} />
      {erreur && <p className="px-5 pb-2 text-sm text-red-600">{erreur}</p>}

      {attente.length === 0 ? (
        <Vide texte={`Aucun inscrit en attente pour ${annee}.`}
              action={
                <Link href="/dashboard/ipgei/inscriptions/nouvelle" className={BTN_SECONDAIRE}>
                  Inscrire un étudiant
                </Link>
              } />
      ) : (
        <div className="divide-y divide-gray-100 border-t border-gray-100">
          {attente.map(i => {
            // Même niveau, et jamais la classe d'attente : affecter vers elle
            // n'affecte à rien, et le serveur le refuse.
            const cibles = classes.filter(
              c => c.niveau === i.niveau && !c.est_conteneur);
            return (
              <div key={i.id} className="flex items-center gap-3 px-5 py-3.5 flex-wrap">
                <div className="flex-1 min-w-[220px]">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold text-iss-dark">{i.etudiant_nom}</span>
                    <Badge ton="ambre">En attente</Badge>
                  </div>
                  <p className="text-xs text-iss-gray mt-0.5">
                    {i.etudiant_matricule} · {i.niveau}
                  </p>
                </div>

                {cibles.length === 0 ? (
                  <p className="text-xs text-amber-700">
                    Aucune classe de {i.niveau} ouverte en {annee}.
                  </p>
                ) : (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {cibles.map(c => (
                      <button key={c.id} onClick={() => poser(i, c.id)}
                              disabled={affecter.isPending}
                              className={BTN_SECONDAIRE}>
                        {c.nom}
                        <span className="text-iss-gray">
                          {' '}· {effectifs.get(c.id) ?? 0}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {attente.length > 0 && (
        <p className="px-5 py-3 text-xs text-iss-gray border-t border-gray-100">
          Le nombre à côté de chaque classe est son effectif actuel — de quoi
          répartir sans rouvrir l&apos;écran des classes.
        </p>
      )}
    </div>
  );
}
