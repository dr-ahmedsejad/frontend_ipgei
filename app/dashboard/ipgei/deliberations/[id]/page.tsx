'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, Calculator, CheckCircle2, FileBadge, FileText, Lock, Scale,
} from 'lucide-react';

import { ConfirmModal } from '@/components/ConfirmModal';
import {
  BTN_PRIMAIRE, BTN_SECONDAIRE, Badge, CARTE, Chargement, DEGRADE, EnTetePage,
  Erreur, INPUT, SELECT, Toast, Tuile, Vide, fmtNote, tonDecision,
} from '../../_ui';
import {
  useClassesSelect, useDeliberation, useDeliberationMutations, useDocumentMutations,
  useLignesDeliberation, useStatistiquesDeliberation,
} from '@/lib/api/ipgei-hooks';
import { downloadBlob } from '@/lib/downloadBlob';
import { DECISIONS_PAR_NIVEAU, type LigneDeliberation } from '@/types/ipgei';

export default function JuryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const deliberationId = Number(id);

  const [classeFiltre, setClasseFiltre] = useState('');
  const [toast, setToast]   = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [aValider, setAValider] = useState(false);

  const notifier = (m: string) => { setToast(m); setTimeout(() => setToast(null), 3200); };
  const signaler = (e: unknown) => setErreur(e instanceof Error ? e.message : 'Erreur');

  const { data: deliberation, isLoading } = useDeliberation(deliberationId);
  const { data: lignes = [], isLoading: chargeLignes } = useLignesDeliberation(
    deliberationId, classeFiltre ? Number(classeFiltre) : undefined,
  );
  const { data: stats } = useStatistiquesDeliberation(deliberationId);
  const { data: classes = [] } = useClassesSelect({
    annee_universitaire: deliberation?.annee_universitaire, actif: true,
  });

  const { calculer, valider, ajusterLigne } = useDeliberationMutations();
  const documents = useDocumentMutations();

  if (isLoading || !deliberation) return <Chargement />;

  const verrouillee = deliberation.est_verrouillee;
  const classesDuNiveau = classes.filter(c => c.niveau === deliberation.niveau);
  const decisions = DECISIONS_PAR_NIVEAU[deliberation.niveau];

  const emettreDecisions = () => {
    documents.decisionsClasse.mutate(
      { deliberation: deliberationId, classe: classeFiltre ? Number(classeFiltre) : undefined },
      {
        onSuccess: (r) => notifier(
          `${r.emis} décision(s) émise(s)` +
          (r.erreurs.length ? ` — ${r.erreurs.length} en échec` : ''),
        ),
        onError: signaler,
      },
    );
  };

  return (
    <div className="space-y-5">
      <Link href="/dashboard/ipgei/deliberations"
            className="inline-flex items-center gap-1.5 text-sm text-iss-gray hover:text-[#006633] transition-colors">
        <ArrowLeft size={14} /> Toutes les délibérations
      </Link>

      <EnTetePage
        icone={<Scale size={14} className="text-white" />}
        titre={deliberation.libelle
          || `${deliberation.niveau} — ${deliberation.portee === 'semestre' ? deliberation.semestre_code : 'année'}`}
        sousTitre={
          <>
            {deliberation.annee_universitaire} · seuil {Number(deliberation.seuil_validation).toFixed(2)}
            {deliberation.plafond_rattrapage &&
              ` · rattrapage plafonné à ${Number(deliberation.plafond_rattrapage).toFixed(2)}`}
            {' · '}
            <Badge ton={verrouillee ? 'vert' : deliberation.statut === 'calculee' ? 'bleu' : 'neutre'}>
              {deliberation.statut_display}
            </Badge>
          </>
        }
        actions={
          <>
            {!verrouillee && (
              <button onClick={() => calculer.mutate(deliberationId, {
                        onSuccess: (r) => notifier(`${r.lignes} étudiant(s) recalculé(s)`),
                        onError: signaler,
                      })}
                      disabled={calculer.isPending}
                      className={BTN_SECONDAIRE}>
                <Calculator size={14} /> {calculer.isPending ? 'Calcul…' : 'Calculer'}
              </button>
            )}
            {!verrouillee && deliberation.statut === 'calculee' && (
              <button onClick={() => setAValider(true)} className={BTN_PRIMAIRE} style={{ background: DEGRADE }}>
                <CheckCircle2 size={14} /> Valider le jury
              </button>
            )}
            {verrouillee && (
              <button onClick={emettreDecisions} disabled={documents.decisionsClasse.isPending}
                      className={BTN_PRIMAIRE} style={{ background: DEGRADE }}>
                <FileText size={14} /> Émettre les décisions
              </button>
            )}
          </>
        }
      />

      {erreur && <Erreur erreur={new Error(erreur)} />}

      {verrouillee && (
        <div className={`${CARTE} px-4 py-3 flex items-center gap-2`} style={{ borderLeft: '3px solid #006633' }}>
          <Lock size={14} className="text-[#006633]" />
          <p className="text-xs text-iss-gray">
            Jury validé{deliberation.validee_par_nom && ` par ${deliberation.validee_par_nom}`}
            {deliberation.date_validation && ` le ${new Date(deliberation.date_validation).toLocaleDateString('fr-FR')}`}.
            Les notes concernées sont verrouillées et les décisions sont reportées sur les inscriptions.
          </p>
        </div>
      )}

      {stats && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Tuile label="Effectif" valeur={stats.effectif}
                 detail={`${stats.notes_saisies} avec moyenne`} />
          <Tuile label="Moyenne de promotion" valeur={fmtNote(stats.moyenne_promo)} />
          <Tuile label="Meilleure moyenne" valeur={fmtNote(stats.meilleure)} />
          <Tuile label="Plus faible" valeur={fmtNote(stats.plus_faible)} />
        </div>
      )}

      {stats && Object.keys(stats.repartition).length > 0 && (
        <div className={`${CARTE} p-4 flex flex-wrap gap-2`}>
          <span className="text-xs font-bold text-iss-gray uppercase tracking-wide self-center mr-1">
            Répartition
          </span>
          {Object.entries(stats.repartition).map(([cle, nombre]) => (
            <Badge key={cle} ton={tonDecision(cle)}>
              {decisions.find(d => d.value === cle)?.label ?? 'Sans décision'} : {nombre}
            </Badge>
          ))}
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        <select value={classeFiltre} onChange={e => setClasseFiltre(e.target.value)}
                className={SELECT} style={{ width: 200 }}>
          <option value="">Toutes les classes du niveau</option>
          {classesDuNiveau.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
        </select>
      </div>

      <div className={`${CARTE} overflow-hidden`}>
        {chargeLignes ? <Chargement /> : lignes.length === 0 ? (
          <Vide texte="Aucune ligne — lancez le calcul pour établir les résultats du jury." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold text-iss-gray uppercase tracking-wide border-b border-gray-100">
                  <th className="px-4 py-3 w-14 text-center">Rang</th>
                  <th className="px-4 py-3">Étudiant</th>
                  <th className="px-4 py-3">Classe</th>
                  <th className="px-4 py-3 text-center">Moyenne</th>
                  <th className="px-4 py-3">Proposition</th>
                  <th className="px-4 py-3">Décision du jury</th>
                  <th className="px-4 py-3">Motif si dérogation</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {lignes.map(ligne => (
                  <LigneJury
                    key={ligne.id} ligne={ligne}
                    deliberationId={deliberationId}
                    niveau={deliberation.niveau}
                    verrouillee={verrouillee}
                    seuil={Number(deliberation.seuil_validation)}
                    onAjuster={ajusterLigne}
                    onNotifier={notifier}
                    onErreur={signaler}
                    documents={documents}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConfirmModal
        open={aValider}
        title="Valider la délibération"
        message={
          "La validation fige les décisions, verrouille les notes concernées et met à jour " +
          "le statut de chaque inscription. Le compteur de redoublement est incrémenté pour " +
          "les redoublants. Cette opération n'est pas réversible."
        }
        confirmLabel="Valider le jury"
        variant="success"
        onConfirm={() => valider.mutate(deliberationId, {
          onSuccess: () => { setAValider(false); notifier('Délibération validée'); },
          onError:   (e) => { setAValider(false); signaler(e); },
        })}
        onCancel={() => setAValider(false)}
        loading={valider.isPending}
      />

      <Toast message={toast} />
    </div>
  );
}

type MutationsDocuments = ReturnType<typeof useDocumentMutations>;

function LigneJury({
  ligne, deliberationId, niveau, verrouillee, seuil, onAjuster, onNotifier, onErreur, documents,
}: {
  ligne: LigneDeliberation;
  deliberationId: number;
  niveau: 'MPSI' | 'MP';
  verrouillee: boolean;
  seuil: number;
  onAjuster: { mutate: (v: never, o?: object) => void; isPending: boolean };
  onNotifier: (m: string) => void;
  onErreur: (e: unknown) => void;
  documents: MutationsDocuments;
}) {
  const [motif, setMotif] = useState(ligne.motif_ajustement);
  const decisions = DECISIONS_PAR_NIVEAU[niveau];
  const moyenne = ligne.moyenne_generale != null ? Number(ligne.moyenne_generale) : null;
  const sousSeuil = moyenne != null && moyenne < seuil;

  const changerDecision = (decision: string) => {
    onAjuster.mutate({ id: ligne.id, input: { decision, motif_ajustement: motif } } as never, {
      onSuccess: () => onNotifier('Décision enregistrée'),
      onError:   onErreur,
    });
  };

  const enregistrerMotif = () => {
    if (motif === ligne.motif_ajustement) return;
    onAjuster.mutate({ id: ligne.id, input: { motif_ajustement: motif } } as never, {
      onSuccess: () => onNotifier('Motif enregistré'),
      onError:   onErreur,
    });
  };

  const telecharger = (blob: Blob, nom: string) => downloadBlob(blob, nom);

  return (
    <tr className="hover:bg-gray-50/60">
      <td className="px-4 py-3 text-center font-bold text-iss-gray">{ligne.rang ?? '—'}</td>
      <td className="px-4 py-3">
        <div className="font-semibold text-iss-dark whitespace-nowrap">{ligne.etudiant_nom}</div>
        <div className="text-xs text-iss-gray">
          {ligne.etudiant_matricule}
          {ligne.nb_redoublements > 0 && ` · ${ligne.nb_redoublements} redoublement(s)`}
        </div>
      </td>
      <td className="px-4 py-3 text-iss-gray whitespace-nowrap">{ligne.classe_nom}</td>
      <td className={`px-4 py-3 text-center font-bold ${sousSeuil ? 'text-red-600' : 'text-[#006633]'}`}>
        {fmtNote(ligne.moyenne_generale)}
      </td>
      <td className="px-4 py-3">
        {ligne.decision_auto
          ? <Badge ton={tonDecision(ligne.decision_auto)}>{ligne.decision_auto_display}</Badge>
          : <span className="text-xs text-iss-gray">—</span>}
      </td>
      <td className="px-4 py-3">
        {verrouillee ? (
          <Badge ton={tonDecision(ligne.decision)}>{ligne.decision_display || '—'}</Badge>
        ) : (
          <select value={ligne.decision} className={SELECT} style={{ minWidth: 170 }}
                  onChange={e => changerDecision(e.target.value)}>
            <option value="">Sans décision</option>
            {decisions.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
          </select>
        )}
      </td>
      <td className="px-4 py-3">
        {ligne.est_ajustee || motif ? (
          verrouillee ? (
            <span className="text-xs text-iss-gray italic">{ligne.motif_ajustement || '—'}</span>
          ) : (
            <input value={motif} onChange={e => setMotif(e.target.value)} onBlur={enregistrerMotif}
                   placeholder="Motif obligatoire" className={INPUT} style={{ minWidth: 180 }} />
          )
        ) : (
          <span className="text-xs text-iss-gray">—</span>
        )}
      </td>
      <td className="px-4 py-3">
        {verrouillee && (
          <div className="flex items-center justify-end gap-1">
            <button
              title="Décision de délibération (PDF)"
              onClick={() => documents.decision.mutate(
                { deliberation: deliberationId, inscription: ligne.inscription },
                {
                  onSuccess: (b) => telecharger(b, `decision-${ligne.etudiant_matricule}.pdf`),
                  onError:   onErreur,
                },
              )}
              className="p-2 rounded-lg text-iss-gray hover:bg-gray-100 hover:text-[#006633] transition-colors">
              <FileText size={13} />
            </button>
            {ligne.decision === 'autorise_cnim' && (
              <button
                title="Attestation d'autorisation CNIM (PDF)"
                onClick={() => documents.attestationCnim.mutate(
                  { deliberation: deliberationId, inscription: ligne.inscription },
                  {
                    onSuccess: (b) => telecharger(b, `cnim-${ligne.etudiant_matricule}.pdf`),
                    onError:   onErreur,
                  },
                )}
                className="p-2 rounded-lg text-iss-gray hover:bg-gray-100 hover:text-[#006633] transition-colors">
                <FileBadge size={13} />
              </button>
            )}
          </div>
        )}
      </td>
    </tr>
  );
}
