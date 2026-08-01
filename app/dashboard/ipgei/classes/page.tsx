'use client';

import { useState } from 'react';
import {
  ChevronDown, ChevronRight, Layers, Pencil, Plus, Trash2, Users, X,
} from 'lucide-react';

import { ConfirmModal } from '@/components/ConfirmModal';
import { Pagination } from '@/components/Pagination';
import {
  BTN_PRIMAIRE, BTN_SECONDAIRE, Badge, CARTE, Chargement, DEGRADE, EnTetePage,
  Erreur, INPUT, SELECT, Toast, Vide,
} from '../_ui';
import { useAnneeIPGEI } from '../_annee';
import {
  useClasseMutations, useClasses, useMatieresSelect, useSousGroupeMutations,
} from '@/lib/api/ipgei-hooks';
import { NIVEAUX, type Classe, type NiveauIPGEI, type SousGroupeTP } from '@/types/ipgei';

type Formulaire = {
  niveau: NiveauIPGEI; libelle: string; capacite: string; actif: boolean;
};
const VIDE: Formulaire = { niveau: 'MPSI', libelle: '', capacite: '', actif: true };

export default function ClassesIPGEIPage() {
  const { annee, setAnnee, options } = useAnneeIPGEI();
  const [page, setPage]     = useState(1);
  const [niveau, setNiveau] = useState('');
  const [ouverte, setOuverte] = useState<number | null>(null);

  const filtres = { page, annee_universitaire: annee, niveau: niveau || undefined };
  const { data, isLoading, error } = useClasses(annee ? filtres : { page: 1, annee_universitaire: '__aucune__' });
  const { create, update, remove } = useClasseMutations();

  const [form, setForm]         = useState<Formulaire>(VIDE);
  const [edition, setEdition]   = useState<Classe | null>(null);
  const [formOuvert, setFormOuvert] = useState(false);
  const [erreurForm, setErreurForm] = useState<string | null>(null);
  const [aSupprimer, setASupprimer] = useState<Classe | null>(null);
  const [toast, setToast]       = useState<string | null>(null);

  const notifier = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2800); };

  const classes = data?.results ?? [];
  const total   = data?.count ?? 0;

  const ouvrirAjout = () => {
    setEdition(null); setForm(VIDE); setErreurForm(null); setFormOuvert(true);
  };
  const ouvrirEdition = (c: Classe) => {
    setEdition(c);
    setForm({
      niveau: c.niveau, libelle: c.libelle,
      capacite: c.capacite != null ? String(c.capacite) : '', actif: c.actif,
    });
    setErreurForm(null); setFormOuvert(true);
  };

  const enregistrer = () => {
    if (!form.libelle.trim()) { setErreurForm('Le libellé de la classe est requis (A, B, C…).'); return; }
    setErreurForm(null);
    const payload = {
      niveau:   form.niveau,
      libelle:  form.libelle.trim().toUpperCase(),
      capacite: form.capacite ? Number(form.capacite) : null,
      actif:    form.actif,
      annee_universitaire: annee,
    };
    const succes = () => {
      setFormOuvert(false);
      notifier(edition ? 'Classe modifiée' : 'Classe créée');
    };
    const echec = (e: unknown) => setErreurForm(e instanceof Error ? e.message : 'Erreur');
    if (edition) update.mutate({ id: edition.id, input: payload }, { onSuccess: succes, onError: echec });
    else         create.mutate(payload, { onSuccess: succes, onError: echec });
  };

  const supprimer = () => {
    if (!aSupprimer) return;
    remove.mutate(aSupprimer.id, {
      onSuccess: () => { notifier('Classe supprimée'); setASupprimer(null); },
      onError:   (e) => { setErreurForm(e instanceof Error ? e.message : 'Erreur'); setASupprimer(null); },
    });
  };

  return (
    <div className="space-y-5 max-w-5xl">
      <EnTetePage
        icone={<Users size={14} className="text-white" />}
        titre="Classes et sous-groupes"
        sousTitre={`${total} classe${total !== 1 ? 's' : ''} — aucune limite par niveau et par année.`}
        actions={
          <>
            <select value={annee} onChange={e => { setAnnee(e.target.value); setPage(1); }}
                    className={SELECT} style={{ width: 150 }}>
              {options.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            <select value={niveau} onChange={e => { setNiveau(e.target.value); setPage(1); }}
                    className={SELECT} style={{ width: 160 }}>
              <option value="">Tous les niveaux</option>
              {NIVEAUX.map(n => <option key={n.value} value={n.value}>{n.label}</option>)}
            </select>
            <button onClick={ouvrirAjout} className={BTN_PRIMAIRE} style={{ background: DEGRADE }}>
              <Plus size={14} /> Ajouter
            </button>
          </>
        }
      />

      <Erreur erreur={error} />

      {formOuvert && (
        <div className={`${CARTE} p-6`} style={{ borderLeft: '3px solid #006633' }}>
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-sm font-semibold text-iss-dark">
              {edition ? `Modifier ${edition.nom}` : `Nouvelle classe — ${annee}`}
            </h3>
            <button onClick={() => setFormOuvert(false)}
                    className="p-1 rounded-lg text-iss-gray hover:bg-gray-100 transition-colors">
              <X size={14} />
            </button>
          </div>

          <div className="grid gap-4 sm:grid-cols-4">
            <div>
              <label className="block text-xs font-semibold text-iss-dark mb-1.5">Niveau</label>
              <select value={form.niveau} className={SELECT}
                      onChange={e => setForm(f => ({ ...f, niveau: e.target.value as NiveauIPGEI }))}>
                {NIVEAUX.map(n => <option key={n.value} value={n.value}>{n.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-iss-dark mb-1.5">Libellé</label>
              <input value={form.libelle} className={INPUT} placeholder="A, B, C…" maxLength={10}
                     onChange={e => setForm(f => ({ ...f, libelle: e.target.value }))}
                     onKeyDown={e => e.key === 'Enter' && enregistrer()} autoFocus />
            </div>
            <div>
              <label className="block text-xs font-semibold text-iss-dark mb-1.5">
                Effectif maximal <span className="font-normal text-iss-gray">(indicatif)</span>
              </label>
              <input type="number" min={0} value={form.capacite} className={INPUT} placeholder="—"
                     onChange={e => setForm(f => ({ ...f, capacite: e.target.value }))} />
            </div>
            <div className="flex items-end pb-2">
              <label className="flex items-center gap-2 text-sm text-iss-dark cursor-pointer">
                <input type="checkbox" checked={form.actif}
                       onChange={e => setForm(f => ({ ...f, actif: e.target.checked }))}
                       className="w-4 h-4 accent-[#006633]" />
                Classe active
              </label>
            </div>
          </div>

          {erreurForm && <p className="mt-3 text-sm text-red-600">{erreurForm}</p>}

          <div className="flex gap-2 mt-5">
            <button onClick={enregistrer} disabled={create.isPending || update.isPending}
                    className={BTN_PRIMAIRE} style={{ background: DEGRADE }}>
              {edition ? 'Enregistrer' : 'Créer la classe'}
            </button>
            <button onClick={() => setFormOuvert(false)} className={BTN_SECONDAIRE}>Annuler</button>
          </div>
        </div>
      )}

      <div className={CARTE}>
        {isLoading && !data ? <Chargement /> : classes.length === 0 ? (
          <Vide texte={`Aucune classe pour ${annee}.`}
                action={<button onClick={ouvrirAjout} className={BTN_PRIMAIRE} style={{ background: DEGRADE }}>
                  <Plus size={14} /> Créer la première classe
                </button>} />
        ) : (
          <div className="divide-y divide-gray-100">
            {classes.map(classe => (
              <LigneClasse
                key={classe.id} classe={classe}
                ouverte={ouverte === classe.id}
                onBasculer={() => setOuverte(o => (o === classe.id ? null : classe.id))}
                onEditer={() => ouvrirEdition(classe)}
                onSupprimer={() => setASupprimer(classe)}
                onNotifier={notifier}
              />
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
        title="Supprimer la classe"
        message={aSupprimer
          ? `Supprimer ${aSupprimer.nom} ? Les inscriptions rattachées empêchent la suppression : désactivez la classe plutôt que de la supprimer si elle a servi.`
          : ''}
        onConfirm={supprimer}
        onCancel={() => setASupprimer(null)}
        loading={remove.isPending}
      />

      <Toast message={toast} />
    </div>
  );
}

// ── Une classe + ses sous-groupes de TP ──────────────────────────────────────
function LigneClasse({
  classe, ouverte, onBasculer, onEditer, onSupprimer, onNotifier,
}: {
  classe: Classe; ouverte: boolean; onBasculer: () => void;
  onEditer: () => void; onSupprimer: () => void; onNotifier: (m: string) => void;
}) {
  return (
    <div>
      <div className="flex items-center gap-3 px-5 py-3.5">
        <button onClick={onBasculer} className="p-1 rounded-lg text-iss-gray hover:bg-gray-100 transition-colors">
          {ouverte ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-bold text-iss-dark">{classe.nom}</span>
            <Badge ton={classe.niveau === 'MPSI' ? 'bleu' : 'violet'}>{classe.niveau}</Badge>
            {!classe.actif && <Badge ton="neutre">Inactive</Badge>}
            {classe.capacite != null && classe.effectif > classe.capacite && (
              <Badge ton="ambre">Effectif au-delà de la capacité</Badge>
            )}
          </div>
          <p className="text-xs text-iss-gray mt-0.5">
            {classe.effectif} étudiant{classe.effectif !== 1 ? 's' : ''}
            {classe.capacite != null && ` / ${classe.capacite} places`}
            {classe.sous_groupes.length > 0 &&
              ` · ${classe.sous_groupes.length} sous-groupe${classe.sous_groupes.length > 1 ? 's' : ''} de TP`}
            {classe.professeur_principal_nom && ` · Prof. principal : ${classe.professeur_principal_nom}`}
          </p>
        </div>

        <button onClick={onEditer} title="Modifier"
                className="p-2 rounded-lg text-iss-gray hover:bg-gray-100 hover:text-[#006633] transition-colors">
          <Pencil size={14} />
        </button>
        <button onClick={onSupprimer} title="Supprimer"
                className="p-2 rounded-lg text-iss-gray hover:bg-red-50 hover:text-red-600 transition-colors">
          <Trash2 size={14} />
        </button>
      </div>

      {ouverte && <SousGroupes classe={classe} onNotifier={onNotifier} />}
    </div>
  );
}

function SousGroupes({ classe, onNotifier }: { classe: Classe; onNotifier: (m: string) => void }) {
  const { create, update, remove } = useSousGroupeMutations(classe.id);
  // Seules les matières du niveau de la classe peuvent recevoir des TP dédoublés.
  const semestres = classe.niveau === 'MPSI' ? ['S1', 'S2'] : ['S3', 'S4'];
  const { data: matieres = [] } = useMatieresSelect({ has_tp: true, actif: true });
  const matieresTP = matieres.filter(m => semestres.includes(m.code_semestre));

  const [libelle, setLibelle] = useState('');
  const [erreur, setErreur]   = useState<string | null>(null);

  const ajouter = () => {
    if (!libelle.trim()) { setErreur('Indiquez un libellé (G1, G2…).'); return; }
    setErreur(null);
    create.mutate(
      { classe: classe.id, libelle: libelle.trim().toUpperCase() },
      {
        onSuccess: () => { setLibelle(''); onNotifier('Sous-groupe créé'); },
        onError:   (e) => setErreur(e instanceof Error ? e.message : 'Erreur'),
      },
    );
  };

  const basculerMatiere = (sg: SousGroupeTP, matiereId: number) => {
    const actuelles = sg.matieres ?? [];
    const suivantes = actuelles.includes(matiereId)
      ? actuelles.filter(id => id !== matiereId)
      : [...actuelles, matiereId];
    update.mutate({ id: sg.id, input: { matieres: suivantes } });
  };

  return (
    <div className="px-5 pb-5 pl-14 bg-gray-50/60">
      <div className="flex items-center gap-2 mb-3 pt-3">
        <Layers size={13} className="text-iss-gray" />
        <h4 className="text-xs font-bold text-iss-dark uppercase tracking-wide">
          Sous-groupes de TP — fixes sur le semestre
        </h4>
      </div>

      {classe.sous_groupes.length === 0 ? (
        <p className="text-xs text-iss-gray mb-3">
          Aucun sous-groupe. Créez-en si les TP d&apos;informatique ou de physique
          sont dédoublés.
        </p>
      ) : (
        <div className="space-y-2 mb-3">
          {classe.sous_groupes.map(sg => (
            <div key={sg.id} className="bg-white rounded-xl border border-gray-100 p-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm font-bold text-iss-dark">{sg.libelle}</span>
                <Badge ton="neutre">{sg.effectif} étudiant{sg.effectif !== 1 ? 's' : ''}</Badge>
                <button onClick={() => remove.mutate(sg.id, { onSuccess: () => onNotifier('Sous-groupe supprimé') })}
                        className="ml-auto p-1.5 rounded-lg text-iss-gray hover:bg-red-50 hover:text-red-600 transition-colors">
                  <Trash2 size={13} />
                </button>
              </div>
              {matieresTP.length === 0 ? (
                <p className="text-xs text-iss-gray">
                  Aucune matière avec TP sur {semestres.join(' / ')} — cochez « comporte des TP »
                  sur la matière concernée pour l&apos;affecter ici.
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {matieresTP.map(m => {
                    const active = (sg.matieres ?? []).includes(m.id);
                    return (
                      <button key={m.id} onClick={() => basculerMatiere(sg, m.id)}
                              className={`px-2 py-1 rounded-md border text-xs font-semibold transition-all ${
                                active
                                  ? 'bg-[#006633] text-white border-[#006633]'
                                  : 'bg-white text-iss-gray border-gray-200 hover:border-[#006633]'
                              }`}>
                        {m.code} <span className="opacity-70">{m.code_semestre}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        <input value={libelle} onChange={e => setLibelle(e.target.value)}
               onKeyDown={e => e.key === 'Enter' && ajouter()}
               placeholder="G1, G2…" maxLength={10}
               className={INPUT} style={{ width: 140 }} />
        <button onClick={ajouter} disabled={create.isPending} className={BTN_SECONDAIRE}>
          <Plus size={13} /> Ajouter un sous-groupe
        </button>
      </div>
      {erreur && <p className="mt-2 text-xs text-red-600">{erreur}</p>}
    </div>
  );
}
