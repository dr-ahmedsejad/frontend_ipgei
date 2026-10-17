/*
 * Les règles du mode salle (`lib/salle-appel.ts`), 17/10/2026.
 *
 * En `.mjs` et non `.test.ts` : l'IPGEI n'autorise pas l'import d'un `.ts`
 * par son extension (`allowImportingTsExtensions` absent du tsconfig), et
 * `tsc --noEmit` refuserait le fichier. Node (≥ 22.18) lit le `.ts` importé
 * tel quel. Lancement : `node --test lib/salle-appel.test.mjs`.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  ABSENT, JUSTIFIEE, PRESENT, SANCTIONNE,
  aujourdhuiIso, bilanParJour, estVerrouille, jourAProposer, libelleBilan, libelleDates,
  lienAppel, peutSanctionner, presencesAEnvoyer, seanceSuivante, statutSuivant,
} from './salle-appel.ts';

const JOURS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
const SEANCES = [
  { jour_label: 'Lundi', date_suivie: '2026-10-19', appel: { saisi: true } },
  { jour_label: 'Lundi', date_suivie: '2026-10-19', appel: { saisi: false } },
  { jour_label: 'Mercredi', date_suivie: '2026-10-21', appel: { saisi: false } },
];

test('les séances se comptent par jour, avec la date et les appels faits', () => {
  const b = bilanParJour(SEANCES);
  assert.deepEqual(b.get('Lundi'), { date: '2026-10-19', seances: 2, faits: 1 });
  assert.deepEqual(b.get('Mercredi'), { date: '2026-10-21', seances: 1, faits: 0 });
  assert.equal(b.get('Mardi'), undefined);
});

test('le jour choisi est gardé s’il a des séances', () => {
  assert.equal(jourAProposer(JOURS, bilanParJour(SEANCES), 'Mercredi', '2026-10-19'), 'Mercredi');
});

test('sinon, aujourd’hui — par la DATE, pas par le nom du jour', () => {
  assert.equal(jourAProposer(JOURS, bilanParJour(SEANCES), 'Mardi', '2026-10-21'), 'Mercredi');
});

test('sinon, le premier jour qui a cours ; jamais une journée vide', () => {
  assert.equal(jourAProposer(JOURS, bilanParJour(SEANCES), null, '2026-10-25'), 'Lundi');
  assert.equal(jourAProposer(JOURS, new Map(), 'Lundi', '2026-10-19'), null);
});

test('les dates d’une semaine, et la date du jour en heure locale', () => {
  assert.equal(libelleDates({ debut: '2026-10-19', fin: '2026-10-24' }), '19/10 – 24/10');
  assert.equal(libelleDates(null), '');
  assert.equal(aujourdhuiIso(new Date(2026, 9, 5)), '2026-10-05');
});

test('le bilan dit présents, absents et sanctionnés, même à zéro', () => {
  assert.equal(libelleBilan({ presents: 4, absents: 1, sanctions: 0, justifiees: 0 }),
               '4 présents · 1 absent · 0 sanctionné');
  assert.equal(libelleBilan({ presents: 1, absents: 0, sanctions: 0, justifiees: 2 }),
               '1 présent · 0 absent · 0 sanctionné · 2 justifiés');
});

test('le cycle : P ↔ A pour tous, P → A → S pour qui sanctionne', () => {
  assert.equal(statutSuivant(PRESENT, false), ABSENT);
  assert.equal(statutSuivant(ABSENT, false), PRESENT);
  assert.equal(statutSuivant(ABSENT, true), SANCTIONNE);
  assert.equal(statutSuivant(SANCTIONNE, true), PRESENT);
});

test('la justifiée est verrouillée pour tous, la sanction pour qui ne sanctionne pas', () => {
  assert.equal(estVerrouille(JUSTIFIEE, true), true);
  assert.equal(statutSuivant(JUSTIFIEE, true), JUSTIFIEE);
  assert.equal(estVerrouille(SANCTIONNE, false), true);
  assert.equal(statutSuivant(SANCTIONNE, false), SANCTIONNE);
  assert.equal(estVerrouille(SANCTIONNE, true), false);
  assert.equal(peutSanctionner('scolarite'), true);
  assert.equal(peutSanctionner('enseignant'), false);
  assert.equal(peutSanctionner(undefined), false);
});

test('seul ce qui change, ou n’a pas de ligne, part ; le commentaire est gardé', () => {
  const etudiants = [{ id: 1 }, { id: 2 }, { id: 3 }];
  const statuts = new Map([[1, ABSENT], [2, PRESENT], [3, PRESENT]]);
  const deja = { 1: { statut: PRESENT, commentaire: 'émargement' }, 2: { statut: PRESENT } };
  assert.deepEqual(presencesAEnvoyer(etudiants, statuts, deja), [
    { etudiant_id: 1, statut: ABSENT, commentaire: 'émargement' },
    { etudiant_id: 3, statut: PRESENT, commentaire: '' },
  ]);
});

test('la séance suivante, le même jour', () => {
  const s = [{ id: 1, jour_label: 'Lundi' }, { id: 2, jour_label: 'Lundi' },
             { id: 3, jour_label: 'Mardi' }];
  assert.deepEqual(seanceSuivante(s, 1, 'Lundi'), { id: 2, jour_label: 'Lundi' });
  assert.equal(seanceSuivante(s, 2, 'Lundi'), null);
  assert.equal(seanceSuivante(s, 9, 'Lundi'), null);
});

test('l’adresse de l’appel garde le retour vers la surveillance', () => {
  assert.equal(lienAppel(12), '/dashboard/absences/saisir/salle/12');
  assert.equal(lienAppel(12, '/dashboard/ipgei/edt/surveillance?date=2026-10-15'),
               '/dashboard/absences/saisir/salle/12?retour=%2Fdashboard%2Fipgei%2Fedt%2Fsurveillance%3Fdate%3D2026-10-15');
});
