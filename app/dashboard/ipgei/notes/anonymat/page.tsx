'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Eye, EyeOff, Hash, Lock, RefreshCw, Save, Shuffle } from 'lucide-react';

import {
  BTN_PRIMAIRE, BTN_SECONDAIRE, Badge, CARTE, Chargement, DEGRADE, EnTetePage,
  Erreur, INPUT, SELECT, Toast, Vide,
} from '../../_ui';
import { anneeParDefaut } from '../../_annee';
import {
  useAnneesIPGEI, useAnonymatMutations, useAnonymats, useMatieresSelect,
  useSemestresAll, useSessions,
} from '@/lib/api/ipgei-hooks';
import type { TypeEvaluation } from '@/types/ipgei';

/**
 * Seul l'examen se corrige sous anonymat : un devoir surveillé se corrige au
 * fil du semestre, souvent en classe, et l'anonymat n'y a pas de prise.
 */
const TYPE_ANONYME: TypeEvaluation = 'exam';

/**
 * Anonymat des copies.
 *
 * Le correcteur saisit sous un numéro, jamais sous un nom. La table de
 * correspondance existe — il faut bien reporter les notes — mais elle reste
 * masquée par défaut : l'afficher à côté de la saisie reviendrait à annuler
 * l'anonymat au moment même où il sert.
 */
export default function AnonymatPage() {
  // L'année vient de la session et n'est pas répétée ici : la barre du haut la
  // porte déjà. Un écran de correction n'a pas à laisser changer de promotion.
  const annee = anneeParDefaut();
  const { data: anneesOuvertes = [], isLoading: chargeAnnees } = useAnneesIPGEI(true);
  const anneeOuverte = chargeAnnees || anneesOuvertes.includes(annee);

  const [semestreId, setSemestreId] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [echec, setEchec]     = useState<string | null>(null);
  const [tableVisible, setTableVisible] = useState(false);

  const notifier = (m: string) => { setMessage(m); setTimeout(() => setMessage(null), 2800); };
  const signaler = (e: unknown) => setEchec(e instanceof Error ? e.message : 'Erreur');

  const { data: semestres = [] } = useSemestresAll({ annee_universitaire: annee });
  const { data: sessions = [] }  = useSessions(annee);

  // L'anonymat porte sur la campagne normale, et sur l'examen seul : c'est la
  // seule épreuve ramassée sur copie à en-tête détachable.
  const session = useMemo(
    () => sessions.find(s => s.semestre === semestreId && s.type_session === 'normale'),
    [sessions, semestreId],
  );

  const { data: table = [], isLoading } = useAnonymats(session?.id);
  const { generer, saisir } = useAnonymatMutations(session?.id);

  useEffect(() => { setTableVisible(false); }, [semestreId]);

  const semestre = semestres.find(s => s.id === semestreId);

  return (
    <div className="space-y-5">
      <Toast message={message} />

      <EnTetePage
        icone={<Hash size={14} className="text-white" />}
        titre="Anonymat des copies"
        sousTitre="Numéros tirés au sort, saisie sous numéro, correspondance sur demande."
        actions={
          <>
            <select value={semestreId ?? ''} className={SELECT} style={{ maxWidth: 190 }}
                    onChange={e => setSemestreId(e.target.value ? Number(e.target.value) : null)}>
              <option value="">Semestre…</option>
              {semestres.map(s => (
                <option key={s.id} value={s.id}>
                  {s.code} — {s.libelle_annee}{s.est_cloture ? ' (clôturé)' : ''}
                </option>
              ))}
            </select>
          </>
        }
      />

      {!anneeOuverte && (
        <div className={`${CARTE} px-5 py-4 flex items-start gap-3.5`}
             style={{ borderLeft: '3px solid #d97706' }}>
          <Lock size={16} className="text-amber-600 mt-1 flex-shrink-0" />
          <div className="space-y-2 max-w-prose">
            <p className="text-sm font-bold text-iss-dark leading-snug">
              Année {annee} clôturée
            </p>
            <p className="text-xs text-iss-gray leading-relaxed">
              Les numéros déjà tirés restent consultables. Aucun nouveau tirage
              n&apos;est possible, et plus aucune copie ne peut être notée.
            </p>
          </div>
        </div>
      )}

      {echec && <Erreur erreur={new Error(echec)} />}

      {!session ? (
        <div className={CARTE}>
          <Vide texte="Choisissez un semestre pour ouvrir sa campagne de correction." />
        </div>
      ) : (
        <>
          <div className={`${CARTE} p-4 space-y-3`} style={{ borderLeft: '3px solid #006633' }}>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-bold text-iss-dark">
                {semestre?.code} — session normale
              </span>
              <Badge ton={session.est_saisissable ? 'vert' : 'ambre'}>
                {session.est_saisissable ? 'Saisie ouverte' : 'Saisie fermée'}
              </Badge>
              <Badge ton={table.length ? 'bleu' : 'neutre'}>
                {table.length} numéro(s) attribué(s)
              </Badge>

              <div className="ml-auto flex gap-2">
                {table.length === 0 ? (
                  <button onClick={() => { setEchec(null); generer.mutate(
                            { id: session.id },
                            { onSuccess: (r) => notifier(`${r.anonymats_generes} numéro(s) tiré(s)`),
                              onError: signaler });
                          }}
                          disabled={generer.isPending || session.est_close || !anneeOuverte}
                          className={BTN_PRIMAIRE} style={{ background: DEGRADE }}>
                    <Shuffle size={13} /> {generer.isPending ? 'Tirage…' : 'Tirer les numéros'}
                  </button>
                ) : (
                  <button onClick={() => { setEchec(null); generer.mutate(
                            { id: session.id, regenerer: true },
                            { onSuccess: (r) => notifier(`${r.anonymats_generes} numéro(s) retirés au sort`),
                              onError: signaler });
                          }}
                          disabled={generer.isPending || session.est_close || !anneeOuverte}
                          className={BTN_SECONDAIRE}>
                    <RefreshCw size={13} className={generer.isPending ? 'animate-spin' : ''} />
                    Régénérer
                  </button>
                )}
              </div>
            </div>
            <p className="text-xs text-iss-gray">
              Les numéros sont tirés au sort : distribués dans l&apos;ordre alphabétique,
              ils laisseraient deviner l&apos;identité d&apos;une copie. Une régénération après
              le début de la saisie est refusée — elle attribuerait les notes déjà
              entrées à d&apos;autres étudiants.
            </p>
          </div>

          <SaisieAnonyme
            semestreId={semestreId!}
            codeSemestre={semestre?.code}
            ouverte={session.est_saisissable}
            enCours={saisir.isPending}
            onSaisir={(entree, apres) => {
              setEchec(null);
              saisir.mutate(entree, {
                onSuccess: (r) => { notifier(`Copie n° ${r.numero_anonymat} : ${r.valeur}`); apres(); },
                onError:   signaler,
              });
            }}
          />

          <div className={`${CARTE} p-4 space-y-3`}>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-iss-dark">Table de correspondance</h2>
              <span className="text-xs text-iss-gray">
                Sa consultation lève l&apos;anonymat — à réserver au report des notes.
              </span>
              <button onClick={() => setTableVisible(v => !v)}
                      className={`${BTN_SECONDAIRE} ml-auto`} disabled={!table.length}>
                {tableVisible ? <EyeOff size={13} /> : <Eye size={13} />}
                {tableVisible ? 'Masquer' : 'Afficher'}
              </button>
            </div>

            {isLoading ? <Chargement texte="Lecture des numéros…" />
             : !table.length ? (
              <p className="text-xs text-iss-gray">
                Aucun numéro attribué pour cette campagne.
              </p>
            ) : !tableVisible ? (
              <p className="text-xs text-iss-gray">
                {table.length} correspondance(s) enregistrée(s), masquées.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs font-semibold text-iss-gray uppercase tracking-wide border-b border-gray-100">
                      <th className="px-3 py-2 w-20 text-center">N°</th>
                      <th className="px-3 py-2">Étudiant</th>
                      <th className="px-3 py-2">Matricule</th>
                      <th className="px-3 py-2">Classe</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {table.map(ligne => (
                      <tr key={ligne.numero} className="hover:bg-gray-50/60">
                        <td className="px-3 py-2 text-center font-bold text-[#006633]">
                          {ligne.numero}
                        </td>
                        <td className="px-3 py-2 font-semibold text-iss-dark">{ligne.etudiant_nom}</td>
                        <td className="px-3 py-2 text-iss-gray">{ligne.etudiant_matricule}</td>
                        <td className="px-3 py-2 text-iss-gray">{ligne.classe}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function SaisieAnonyme({ semestreId, codeSemestre, ouverte, enCours, onSaisir }: {
  semestreId:   number;
  codeSemestre: string | undefined;
  ouverte:      boolean;
  enCours:      boolean;
  onSaisir: (
    entree: {
      semestre: number; matiere: number; numero_anonymat: number;
      type_evaluation: TypeEvaluation; numero: number; valeur: string;
    },
    apres: () => void,
  ) => void;
}) {
  const { data: matieres = [] } = useMatieresSelect({ code_semestre: codeSemestre, actif: true });

  const [matiere, setMatiere] = useState('');
  const [epreuve, setEpreuve] = useState('1');
  const [numero, setNumero]   = useState('');
  const [valeur, setValeur]   = useState('');

  const complet = matiere && numero && valeur;

  return (
    <div className={`${CARTE} p-4 space-y-3`}>
      <div className="flex items-center gap-2 flex-wrap">
        <h2 className="text-sm font-bold text-iss-dark">Saisie sous numéro</h2>
        {/* Une copie à la fois convient pour un rattrapage isolé ; pour un
            paquet entier, la feuille de saisie évite autant d'allers-retours
            qu'il y a d'étudiants. */}
        <Link href="/dashboard/ipgei/notes/saisie-anonymat"
              className="ml-auto text-xs font-medium text-[#006633] hover:underline">
          Saisir tout un paquet →
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-5">
        <div className="sm:col-span-2">
          <label className="block text-xs font-semibold text-iss-dark mb-1.5">Matière</label>
          <select value={matiere} onChange={e => setMatiere(e.target.value)} className={SELECT}>
            <option value="">Choisir…</option>
            {matieres.map(m => <option key={m.id} value={m.id}>{m.code} — {m.intitule}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-iss-dark mb-1.5">
            N° d&apos;examen
          </label>
          <input value={epreuve} onChange={e => setEpreuve(e.target.value)}
                 inputMode="numeric" className={INPUT} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-iss-dark mb-1.5">
            N° de copie
          </label>
          <input value={numero} onChange={e => setNumero(e.target.value)}
                 inputMode="numeric" placeholder="ex. 17" className={INPUT} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-iss-dark mb-1.5">Note /20</label>
          <input value={valeur} onChange={e => setValeur(e.target.value)}
                 inputMode="decimal" placeholder="ex. 13.5" className={INPUT} />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={() => onSaisir(
            {
              semestre: semestreId, matiere: Number(matiere),
              numero_anonymat: Number(numero), type_evaluation: TYPE_ANONYME,
              numero: Number(epreuve) || 1, valeur: valeur.trim(),
            },
            // Le numéro et la note se vident, la matière et l'épreuve restent :
            // on corrige un paquet de copies, pas une copie isolée.
            () => { setNumero(''); setValeur(''); },
          )}
          disabled={!complet || enCours || !ouverte}
          className={BTN_PRIMAIRE} style={{ background: DEGRADE }}>
          <Save size={13} /> {enCours ? 'Enregistrement…' : 'Enregistrer la copie'}
        </button>
        {!ouverte && (
          <span className="text-xs text-iss-gray">
            La campagne de saisie est fermée — ouvrez-la dans les sessions.
          </span>
        )}
      </div>
    </div>
  );
}
