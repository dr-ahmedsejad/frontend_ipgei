'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, EyeOff, Lock, Save } from 'lucide-react';

import {
  BTN_PRIMAIRE, Badge, CARTE, Chargement, DEGRADE, EnTetePage, Erreur, INPUT,
  SELECT, Toast, Vide,
} from '../../_ui';
import { anneeParDefaut } from '../../_annee';
import {
  useGrilleAnonyme, useMatieresSelect, useSaisieAnonymeLot, useSemestresAll,
} from '@/lib/api/ipgei-hooks';
import type { TypeEvaluation } from '@/types/ipgei';

/**
 * Seul l'examen se corrige sous anonymat. Un devoir surveillé se corrige au
 * fil du semestre, souvent en classe et devant les élèves : l'anonymat n'y a
 * pas de prise, et le proposer donnerait une garantie que rien ne tient.
 */
const TYPE_ANONYME: TypeEvaluation = 'exam';

/**
 * Saisie des notes sous anonymat, feuille par feuille.
 *
 * Le correcteur a devant lui un paquet de copies numérotées. Il saisit d'un
 * trait, du premier numéro au dernier, puis enregistre : copie par copie,
 * corriger une classe demandait autant d'allers-retours que d'étudiants, et
 * une coupure au milieu laissait la moitié des notes entrées sans qu'on sache
 * laquelle.
 *
 * L'écran ne connaît AUCUNE identité — ni nom, ni matricule, ni même
 * l'identifiant de l'inscription. C'est le serveur qui retrouve l'étudiant
 * derrière le numéro, au moment d'écrire. La table de correspondance vit sur
 * l'écran voisin, et ne s'affiche que sur demande.
 */
export default function SaisieAnonymatPage() {
  const annee = anneeParDefaut();

  const [semestreId, setSemestreId] = useState<number | null>(null);
  const [matiereId,  setMatiereId]  = useState<number | null>(null);
  const [epreuve,    setEpreuve]    = useState(1);

  const [saisies, setSaisies] = useState<Record<number, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [echec,   setEchec]   = useState<string | null>(null);

  const { data: semestres = [] } = useSemestresAll({ annee_universitaire: annee });
  const semestre = semestres.find(s => s.id === semestreId) ?? null;
  const { data: matieres = [] } = useMatieresSelect({
    code_semestre: semestre?.code, actif: true,
  });

  const { data: grille, isLoading, error, isFetching } = useGrilleAnonyme({
    semestre: semestreId ?? undefined, matiere: matiereId ?? undefined,
    type_evaluation: TYPE_ANONYME, numero: epreuve,
  });
  const enregistrer = useSaisieAnonymeLot();

  // Les cases repartent de ce que le serveur a renvoyé à chaque changement
  // d'épreuve : garder les saisies d'une épreuve pour la suivante reporterait
  // des notes sur la mauvaise.
  useEffect(() => {
    if (!grille) return;
    const initial: Record<number, string> = {};
    for (const ligne of grille.lignes) {
      initial[ligne.numero_anonymat] = ligne.valeur ?? '';
    }
    setSaisies(initial);
  }, [grille]);

  const initiales = useMemo(() => {
    const valeurs: Record<number, string> = {};
    for (const ligne of grille?.lignes ?? []) {
      valeurs[ligne.numero_anonymat] = ligne.valeur ?? '';
    }
    return valeurs;
  }, [grille]);

  // Ne partent que les copies dont la case a changé : renvoyer la feuille
  // entière réécrirait des notes intactes, et daterait à tort leur saisie.
  const modifiees = useMemo(
    () => Object.entries(saisies)
      .filter(([numero, valeur]) => valeur !== (initiales[Number(numero)] ?? ''))
      .map(([numero, valeur]) => ({
        numero_anonymat: Number(numero),
        valeur: valeur.trim() === '' ? null : valeur.trim(),
      })),
    [saisies, initiales],
  );

  const notifier = (m: string) => { setMessage(m); setTimeout(() => setMessage(null), 2800); };

  const soumettre = () => {
    if (!semestreId || !matiereId || modifiees.length === 0) return;
    setEchec(null);
    enregistrer.mutate(
      {
        semestre: semestreId, matiere: matiereId,
        type_evaluation: TYPE_ANONYME, numero: epreuve, lignes: modifiees,
      },
      {
        onSuccess: (r) => notifier(`${r.copies_traitees} copie(s) enregistrée(s)`),
        onError:   (e) => setEchec(e instanceof Error ? e.message : 'Erreur'),
      },
    );
  };

  const pret = !!semestreId && !!matiereId;

  return (
    <div className="space-y-5 max-w-3xl">
      <Toast message={message} />

      <Link href="/dashboard/ipgei/notes/anonymat"
            className="inline-flex items-center gap-1.5 text-sm text-iss-gray hover:text-[#006633] transition-colors">
        <ArrowLeft size={14} /> Anonymat des copies
      </Link>

      <EnTetePage
        icone={<EyeOff size={14} className="text-white" />}
        titre="Saisie sous anonymat"
        sousTitre="Les copies d'examen, dans l'ordre des numéros. Aucun nom n'apparaît ici."
      />

      <div className={`${CARTE} p-5 space-y-4`}>
        <div className="grid gap-3 sm:grid-cols-4">
          <div>
            <label className="block text-xs font-semibold text-iss-dark mb-1.5">
              Semestre <span className="text-red-600">*</span>
            </label>
            <select value={semestreId ?? ''} className={SELECT}
                    onChange={e => { setSemestreId(e.target.value ? Number(e.target.value) : null);
                                     setMatiereId(null); }}>
              <option value="">— Choisir —</option>
              {semestres.map(s => (
                <option key={s.id} value={s.id}>{s.code} — {s.libelle_annee}</option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-iss-dark mb-1.5">
              Matière <span className="text-red-600">*</span>
            </label>
            <select value={matiereId ?? ''} className={SELECT} disabled={!semestreId}
                    onChange={e => setMatiereId(e.target.value ? Number(e.target.value) : null)}>
              <option value="">— Choisir —</option>
              {matieres.map(m => <option key={m.id} value={m.id}>{m.intitule}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-iss-dark mb-1.5">
              N° d&apos;examen
            </label>
            <input value={epreuve} inputMode="numeric" className={INPUT}
                   onChange={e => setEpreuve(Math.max(1, Number(e.target.value) || 1))} />
          </div>
        </div>

        <Erreur erreur={error} />
        {echec && <Erreur erreur={new Error(echec)} />}
      </div>

      {!pret ? (
        <div className={CARTE}>
          <Vide texte="Choisissez un semestre et une matière pour ouvrir la feuille." />
        </div>
      ) : isLoading ? (
        <div className={CARTE}><Chargement texte="Lecture des copies…" /></div>
      ) : !grille?.lignes.length ? (
        <div className={CARTE}>
          <Vide texte="Aucun numéro tiré pour cette campagne."
                action={
                  <Link href="/dashboard/ipgei/notes/anonymat" className="text-sm text-[#006633] font-medium hover:underline">
                    Tirer les numéros
                  </Link>
                } />
        </div>
      ) : (
        <div className={CARTE}>
          <div className="px-5 pt-5 pb-3 flex items-center gap-2 flex-wrap">
            <h2 className="text-sm font-bold text-iss-dark">
              {grille.lignes.length} copie{grille.lignes.length > 1 ? 's' : ''}
            </h2>
            <Badge ton={grille.saisissable ? 'vert' : 'ambre'}>
              {grille.saisissable ? 'Saisie ouverte' : 'Saisie fermée'}
            </Badge>
            {modifiees.length > 0 && (
              <Badge ton="bleu">{modifiees.length} modifiée(s)</Badge>
            )}
            <button onClick={soumettre}
                    disabled={!grille.saisissable || modifiees.length === 0 || enregistrer.isPending}
                    className={`${BTN_PRIMAIRE} ml-auto`} style={{ background: DEGRADE }}>
              <Save size={13} />
              {enregistrer.isPending ? 'Enregistrement…' : 'Enregistrer la feuille'}
            </button>
          </div>

          {!grille.saisissable && (
            <p className="px-5 pb-3 text-xs text-amber-700">
              La campagne de saisie est fermée : ouvrez-la depuis les sessions
              avant de noter.
            </p>
          )}

          <div className="border-t border-gray-100 divide-y divide-gray-100">
            {grille.lignes.map(ligne => {
              const valeur = saisies[ligne.numero_anonymat] ?? '';
              const change = valeur !== (initiales[ligne.numero_anonymat] ?? '');
              return (
                <div key={ligne.numero_anonymat}
                     className={`flex items-center gap-3 px-5 py-2 ${change ? 'bg-[#006633]/5' : ''}`}>
                  <span className="w-16 text-sm font-bold text-[#006633]">
                    {ligne.numero_anonymat}
                  </span>
                  <input
                    value={valeur}
                    disabled={!grille.saisissable || ligne.verrouillee}
                    inputMode="decimal" placeholder="—"
                    onChange={e => setSaisies(s => ({
                      ...s, [ligne.numero_anonymat]: e.target.value,
                    }))}
                    className={INPUT} style={{ width: 96, textAlign: 'center' }}
                  />
                  <span className="text-xs text-iss-gray">/ 20</span>
                  {ligne.verrouillee && (
                    <span className="ml-auto inline-flex items-center gap-1 text-xs text-iss-gray">
                      <Lock size={12} /> arrêtée par le jury
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          <p className="px-5 py-3 text-xs text-iss-gray border-t border-gray-100">
            Une case vidée efface la note de cette épreuve. Seules les copies
            modifiées sont envoyées, et la feuille passe d&apos;un bloc : en cas
            de refus, aucune note n&apos;est écrite.
            {isFetching && <span className="ml-2 italic">Actualisation…</span>}
          </p>
        </div>
      )}
    </div>
  );
}
