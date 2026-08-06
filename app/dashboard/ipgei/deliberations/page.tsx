'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronRight, Plus, Scale, Trash2, X } from 'lucide-react';

import { ConfirmModal } from '@/components/ConfirmModal';
import { Pagination } from '@/components/Pagination';
import {
  BTN_PRIMAIRE, BTN_SECONDAIRE, Badge, CARTE, Chargement, DEGRADE, EnTetePage,
  Erreur, INPUT, SELECT, Toast, Vide,
} from '../_ui';
import { useAnneeIPGEI } from '../_annee';
import {
  useClassesSelect, useDeliberationMutations, useDeliberations, useParametresIPGEI,
  useSemestresAll, useOptionsNiveaux,
} from '@/lib/api/ipgei-hooks';
import { type Deliberation, type NiveauIPGEI, type PorteeDeliberation,
} from '@/types/ipgei';

const TON_STATUT = { brouillon: 'neutre', calculee: 'bleu', validee: 'vert' } as const;

export default function DeliberationsPage() {
  const { annee, setAnnee, options } = useAnneeIPGEI();
  const [page, setPage]     = useState(1);
  const [classe, setClasse] = useState('');
  const [statut, setStatut] = useState('');

  const { data, isLoading, error } = useDeliberations({
    page, annee_universitaire: annee || '__aucune__',
    classe: classe ? Number(classe) : undefined,
    statut: statut || undefined,
  });

  // Le jury siège classe par classe : c'est par classe qu'on cherche le sien.
  // Le filtre par niveau, qui tenait ce rôle, renvoyait les deux classes d'une
  // même promotion — soit tout ce que l'écran affiche déjà.
  const { data: classes = [] } = useClassesSelect({
    annee_universitaire: annee, actif: true,
  });
  const classesReelles = classes.filter(c => !c.est_conteneur);
  const { create, remove } = useDeliberationMutations();

  const [formOuvert, setFormOuvert] = useState(false);
  const [aSupprimer, setASupprimer] = useState<Deliberation | null>(null);
  const [toast, setToast]           = useState<string | null>(null);
  const notifier = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2800); };

  const deliberations = data?.results ?? [];
  const total         = data?.count ?? 0;

  return (
    <div className="space-y-5 max-w-5xl">
      <EnTetePage
        icone={<Scale size={14} className="text-white" />}
        titre="Délibérations"
        sousTitre="Seuil configurable, décisions proposées automatiquement, ajustables par le jury."
        actions={
          <button onClick={() => setFormOuvert(true)} className={BTN_PRIMAIRE} style={{ background: DEGRADE }}>
            <Plus size={14} /> Nouvelle délibération
          </button>
        }
      />

      <Erreur erreur={error} />

      <div className="flex gap-2 flex-wrap">
        <select value={annee} onChange={e => { setAnnee(e.target.value); setPage(1); }}
                className={SELECT} style={{ width: 150 }}>
          {options.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <select value={classe} onChange={e => { setClasse(e.target.value); setPage(1); }}
                className={SELECT} style={{ width: 190 }}>
          <option value="">Toutes les classes</option>
          {classesReelles.map(c => (
            <option key={c.id} value={c.id}>{c.nom}</option>
          ))}
        </select>
        <select value={statut} onChange={e => { setStatut(e.target.value); setPage(1); }}
                className={SELECT} style={{ width: 160 }}>
          <option value="">Tous les statuts</option>
          <option value="brouillon">Brouillon — à calculer</option>
          <option value="calculee">Calculée — à valider</option>
          <option value="validee">Validée — verrouillée</option>
        </select>
      </div>

      {formOuvert && (
        <FormulaireDeliberation
          annee={annee}
          onFerme={() => setFormOuvert(false)}
          onCree={() => { setFormOuvert(false); notifier('Délibération créée'); }}
          create={create}
        />
      )}

      <div className={CARTE}>
        {isLoading && !data ? <Chargement /> : deliberations.length === 0 ? (
          <Vide texte={`Aucune délibération pour ${annee}.`} />
        ) : (
          <div className="divide-y divide-gray-100">
            {deliberations.map(d => (
              <div key={d.id} className="flex items-center gap-3 px-5 py-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold text-iss-dark">
                      {d.libelle
                        || `${d.classe_nom || d.niveau} — ${d.portee === 'semestre' ? d.semestre_code : 'année'}`}
                    </span>
                    <Badge ton={d.niveau === 'MPSI' ? 'bleu' : 'violet'}>{d.niveau}</Badge>
                    {/* Un jury tenu avant la règle porte tout un niveau : le
                        dire évite de croire à une classe oubliée. */}
                    <Badge ton={d.classe_nom ? 'neutre' : 'ambre'}>
                      {d.classe_nom || 'niveau entier'}
                    </Badge>
                    <Badge ton={TON_STATUT[d.statut]}>{d.statut_display}</Badge>
                  </div>
                  <p className="text-xs text-iss-gray mt-0.5">
                    {d.annee_universitaire} · seuil {Number(d.seuil_validation).toFixed(2)}
                    {d.plafond_rattrapage && ` · rattrapage plafonné à ${Number(d.plafond_rattrapage).toFixed(2)}`}
                    {' · '}{d.nb_lignes} étudiant{d.nb_lignes !== 1 ? 's' : ''}
                    {d.date_validation && ` · validée le ${new Date(d.date_validation).toLocaleDateString('fr-FR')}`}
                  </p>
                </div>

                {!d.est_verrouillee && (
                  <button onClick={() => setASupprimer(d)} title="Supprimer"
                          className="p-2 rounded-lg text-iss-gray hover:bg-red-50 hover:text-red-600 transition-colors">
                    <Trash2 size={13} />
                  </button>
                )}
                <Link href={`/dashboard/ipgei/deliberations/${d.id}`}
                      className="flex items-center gap-1 px-3 py-2 rounded-xl text-sm font-semibold text-[#006633] hover:bg-gray-50 transition-colors">
                  Ouvrir <ChevronRight size={14} />
                </Link>
              </div>
            ))}
          </div>
        )}

        {(data?.pages ?? 1) > 1 && (
          <div className="px-5 pb-4">
            <Pagination page={page} pages={data?.pages ?? 1} count={total} onPage={setPage} />
          </div>
        )}
      </div>

      <ConfirmModal
        open={!!aSupprimer}
        title="Supprimer la délibération"
        message={aSupprimer ? `Supprimer « ${aSupprimer.libelle || aSupprimer.niveau} » ? Les lignes de jury calculées seront perdues.` : ''}
        onConfirm={() => aSupprimer && remove.mutate(aSupprimer.id, {
          onSuccess: () => { notifier('Délibération supprimée'); setASupprimer(null); },
          onError:   () => setASupprimer(null),
        })}
        onCancel={() => setASupprimer(null)}
        loading={remove.isPending}
      />

      <Toast message={toast} />
    </div>
  );
}

function FormulaireDeliberation({
  annee, onFerme, onCree, create,
}: {
  annee: string; onFerme: () => void; onCree: () => void;
  create: { mutate: (v: never, o?: object) => void; isPending: boolean };
}) {
  const optionsNiveaux = useOptionsNiveaux();
  const { data: params } = useParametresIPGEI();
  const { data: semestres = [] } = useSemestresAll({ annee_universitaire: annee });
  const { data: classes = [] } = useClassesSelect({
    annee_universitaire: annee, actif: true,
  });

  const [niveau, setNiveau]   = useState<NiveauIPGEI>('MPSI');
  const [classe, setClasse]   = useState<number | null>(null);
  const [portee, setPortee]   = useState<PorteeDeliberation>('annuelle');
  const [semestre, setSemestre] = useState<number | null>(null);
  const [libelle, setLibelle] = useState('');
  const [seuil, setSeuil]     = useState('');
  const [plafond, setPlafond] = useState('');
  const [erreur, setErreur]   = useState<string | null>(null);

  const semestresDuNiveau = semestres.filter(s => s.niveaux.includes(niveau));
  // Le jury siège classe par classe. La classe d'attente en est exclue : ses
  // inscrits n'ont pas encore de classe, il n'y a rien à y délibérer.
  const classesDuNiveau = classes.filter(
    c => c.niveau === niveau && !c.est_conteneur);

  // Le seuil proposé suit la portée, comme le fait le serveur à la création.
  const seuilDefaut = portee === 'semestre' && params?.seuil_validation_semestre
    ? params.seuil_validation_semestre
    : params?.seuil_validation;

  const enregistrer = () => {
    if (!classe) {
      setErreur('Le jury siège classe par classe : indiquez la classe délibérée.');
      return;
    }
    if (portee === 'semestre' && !semestre) {
      setErreur('Une délibération de semestre doit cibler un semestre.');
      return;
    }
    setErreur(null);
    create.mutate({
      niveau, classe, portee,
      semestre: portee === 'semestre' ? semestre : null,
      annee_universitaire: annee,
      libelle: libelle.trim(),
      // Vide = on reprend les paramètres de l'institut ; la délibération fige
      // ensuite sa propre valeur.
      ...(seuil   ? { seuil_validation: seuil } : {}),
      ...(plafond ? { plafond_rattrapage: plafond } : {}),
    } as never, {
      onSuccess: onCree,
      onError:   (e: unknown) => setErreur(e instanceof Error ? e.message : 'Erreur'),
    });
  };

  return (
    <div className={`${CARTE} p-6`} style={{ borderLeft: '3px solid #006633' }}>
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-sm font-semibold text-iss-dark">Nouvelle délibération — {annee}</h3>
        <button onClick={onFerme} className="p-1 rounded-lg text-iss-gray hover:bg-gray-100 transition-colors">
          <X size={14} />
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className="block text-xs font-semibold text-iss-dark mb-1.5">Niveau</label>
          <select value={niveau} className={SELECT}
                  onChange={e => { setNiveau(e.target.value as NiveauIPGEI);
                                   setClasse(null); setSemestre(null); }}>
            {optionsNiveaux.map(n => <option key={n.value} value={n.value}>{n.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-iss-dark mb-1.5">
            Classe <span className="text-red-600">*</span>
          </label>
          <select value={classe ?? ''} className={SELECT}
                  onChange={e => setClasse(e.target.value ? Number(e.target.value) : null)}>
            <option value="">Choisir…</option>
            {classesDuNiveau.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
          </select>
          {classesDuNiveau.length === 0 && (
            <p className="mt-1 text-xs text-amber-700">
              Aucune classe de {niveau} ouverte en {annee}.
            </p>
          )}
        </div>
        <div>
          <label className="block text-xs font-semibold text-iss-dark mb-1.5">Portée</label>
          <select value={portee} className={SELECT}
                  onChange={e => setPortee(e.target.value as PorteeDeliberation)}>
            <option value="annuelle">Annuelle — décision de passage</option>
            <option value="semestre">Semestre — bilan intermédiaire</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-iss-dark mb-1.5">Semestre</label>
          <select value={semestre ?? ''} className={SELECT} disabled={portee !== 'semestre'}
                  onChange={e => setSemestre(e.target.value ? Number(e.target.value) : null)}>
            <option value="">{portee === 'semestre' ? 'Choisir…' : 'Sans objet'}</option>
            {semestresDuNiveau.map(s => <option key={s.id} value={s.id}>{s.code}</option>)}
          </select>
        </div>

        <div className="sm:col-span-3">
          <label className="block text-xs font-semibold text-iss-dark mb-1.5">
            Libellé <span className="font-normal text-iss-gray">(facultatif)</span>
          </label>
          <input value={libelle} className={INPUT} placeholder="Jury de fin d'année MPSI — session normale"
                 onChange={e => setLibelle(e.target.value)} />
        </div>

        <div>
          <label className="block text-xs font-semibold text-iss-dark mb-1.5">
            Seuil de validation
          </label>
          <input type="number" min="0" max="20" step="0.25" value={seuil} className={INPUT}
                 placeholder={seuilDefaut ? Number(seuilDefaut).toFixed(2) : '10.00'}
                 onChange={e => setSeuil(e.target.value)} />
          <p className="text-xs text-iss-gray mt-1">
            Défaut {portee === 'semestre' ? 'semestriel' : 'annuel'} — figé à la création.
          </p>
        </div>
        <div>
          <label className="block text-xs font-semibold text-iss-dark mb-1.5">
            Plafond de rattrapage
          </label>
          <input type="number" min="0" max="20" step="0.25" value={plafond} className={INPUT}
                 placeholder={params?.plafond_rattrapage
                   ? Number(params.plafond_rattrapage).toFixed(2) : 'Aucun plafond'}
                 onChange={e => setPlafond(e.target.value)} />
        </div>
        <div className="flex items-end pb-2">
          <p className="text-xs text-iss-gray leading-snug">
            Laissés vides, ces deux réglages reprennent les paramètres de l&apos;institut
            et sont ensuite <strong>figés</strong> dans la délibération.
          </p>
        </div>
      </div>

      {erreur && <p className="mt-3 text-sm text-red-600">{erreur}</p>}

      <div className="flex gap-2 mt-5">
        <button onClick={enregistrer} disabled={create.isPending}
                className={BTN_PRIMAIRE} style={{ background: DEGRADE }}>
          Créer
        </button>
        <button onClick={onFerme} className={BTN_SECONDAIRE}>Annuler</button>
      </div>
    </div>
  );
}
