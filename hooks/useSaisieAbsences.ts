'use client';

import { useState, useCallback } from 'react';
import { bulkPresences, uploadJustificatifBySuivi } from '@/lib/api/absences';
import { StatutPresence } from '@/types/absences';
import type { Etudiant } from '@/types/absences';

export interface CellState {
  statut: StatutPresence;
  commentaire: string;
}

/** Une présence déjà enregistrée, telle que la matrice la charge. */
export interface PresenceChargee {
  etudiant: number;
  suivi: number;
  statut: number;
  commentaire?: string | null;
}

/**
 * `canJustify` : seul qui peut justifier (`abs_justificatifs` / `modifier`, ou
 * admin) a « J » dans son cycle. Le serveur ignore désormais un « J » posé
 * sans ce droit (17/10/2026) : le proposer ferait croire à une saisie qui ne
 * s'enregistre pas.
 */
export function useSaisieAbsences(
  { canFullCycle = false, canJustify = false }: { canFullCycle?: boolean; canJustify?: boolean } = {},
) {
  const [cellMap, setCellMap] = useState<Map<string, CellState>>(new Map());
  const [fileMap, setFileMap] = useState<Map<string, File>>(new Map());
  // Les cases que l'utilisateur a TOUCHÉES, et celles qui ont déjà une ligne
  // en base. On n'envoie que les premières, plus celles qui n'ont pas encore
  // de ligne : renvoyer toute la matrice réécrivait en « Présent » une absence
  // que l'écran n'avait pas chargée (17/10/2026).
  const [touchees,   setTouchees]   = useState<Set<string>>(new Set());
  const [existantes, setExistantes] = useState<Set<string>>(new Set());
  const [dirty,   setDirty]   = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  // Lignes que le serveur a ignorées au dernier enregistrement : absence
  // justifiée qu'on voulait défaire, ou « J » posé sans le droit de justifier.
  const [ignorees, setIgnorees] = useState(0);
  // Justificatifs dont l'envoi a échoué : la présence est enregistrée, la
  // pièce non — l'écran le taisait (17/10/2026).
  const [piecesEchouees, setPiecesEchouees] = useState(0);

  const BINARY: StatutPresence[] = [StatutPresence.Present, StatutPresence.Absent];
  const FULL:   StatutPresence[] = [
    StatutPresence.Present,
    StatutPresence.Absent,
    StatutPresence.Sanctionne,
    ...(canJustify ? [StatutPresence.Justifiee] : []),
  ];
  const cycle = canFullCycle ? FULL : BINARY;

  function getCell(etuId: number, suiviId: number): CellState {
    return cellMap.get(`${etuId}:${suiviId}`) ?? { statut: StatutPresence.Present, commentaire: '' };
  }

  /** Un geste de l'utilisateur : la case est marquée « touchée ». */
  function setCell(etuId: number, suiviId: number, update: Partial<CellState>) {
    const key = `${etuId}:${suiviId}`;
    setCellMap(prev => {
      const cur = prev.get(key) ?? { statut: StatutPresence.Present, commentaire: '' };
      return new Map(prev).set(key, { ...cur, ...update });
    });
    setTouchees(prev => new Set(prev).add(key));
    setDirty(true);
  }

  /** Les présences déjà enregistrées : chargées sans être « touchées ». */
  function charger(presences: PresenceChargee[]) {
    const cells = new Map<string, CellState>();
    for (const p of presences) {
      cells.set(`${p.etudiant}:${p.suivi}`,
                { statut: p.statut as StatutPresence, commentaire: p.commentaire || '' });
    }
    setCellMap(cells);
    setExistantes(new Set(cells.keys()));
    setTouchees(new Set());
    setFileMap(new Map());
    setDirty(false);
    setError(null);
  }

  function toggleCell(etuId: number, suiviId: number) {
    const { statut } = getCell(etuId, suiviId);
    // Une justifiée ne se défait que par qui peut justifier (le serveur
    // l'ignorerait) : sa case ne bouge pas.
    if (statut === StatutPresence.Justifiee && !canJustify) return;
    const idx = cycle.indexOf(statut);
    setCell(etuId, suiviId, { statut: cycle[(idx + 1) % cycle.length] });
  }

  function attachFile(etuId: number, suiviId: number, file: File) {
    setFileMap(prev => new Map(prev).set(`${etuId}:${suiviId}`, file));
    setDirty(true);
  }

  function removeFile(etuId: number, suiviId: number) {
    setFileMap(prev => { const n = new Map(prev); n.delete(`${etuId}:${suiviId}`); return n; });
  }

  function resetAll() {
    setCellMap(new Map());
    setFileMap(new Map());
    setTouchees(new Set());
    setExistantes(new Set());
    setDirty(false);
    setError(null);
  }

  /**
   * `pointables` : pour chaque séance, les étudiants de SA liste d'appel — la
   * classe pour un cours, le sous-groupe pour un TP. Une case hors liste n'est
   * jamais envoyée. Absente, tout le monde est pointable (ancien comportement).
   *
   * Par séance, on n'envoie que les cases TOUCHÉES et celles qui n'ont pas
   * encore de ligne en base (l'appel les enregistre « Présent »). Une présence
   * déjà enregistrée que personne n'a touchée n'est jamais renvoyée.
   */
  const save = useCallback(
    async (etudiants: Pick<Etudiant, 'id'>[], suiviIds: number[],
           pointables?: Map<number, Set<number>>) => {
      setSaving(true); setError(null);
      try {
        const aEnvoyer = (etuId: number, sid: number) => {
          const key = `${etuId}:${sid}`;
          return touchees.has(key) || !existantes.has(key);
        };
        const envois = suiviIds
          .map(sid => ({
            sid,
            presences: etudiants
              .filter(etu => !pointables || !!pointables.get(sid)?.has(etu.id))
              .filter(etu => aEnvoyer(etu.id, sid))
              .map(etu => {
                const c = cellMap.get(`${etu.id}:${sid}`) ?? {
                  statut: StatutPresence.Present,
                  commentaire: '',
                };
                return { etudiant_id: etu.id, statut: c.statut, commentaire: c.commentaire };
              }),
          }))
          // Une séance sans rien à écrire n'a rien à envoyer.
          .filter(e => e.presences.length > 0);

        // 1. Les présences — un envoi par séance
        const results = await Promise.allSettled(
          envois.map(e => bulkPresences({ suivi_id: e.sid, presences: e.presences })),
        );
        const failures = results.filter(r => r.status === 'rejected');
        setIgnorees(results.reduce((n, r) => n + (r.status === 'fulfilled'
          ? (r.value.justifiees_preservees ?? 0) + (r.value.justifiees_refusees ?? 0) : 0), 0));
        if (failures.length) {
          throw new Error(`${failures.length} séance(s) non sauvegardée(s).`);
        }

        // 2. Les justificatifs, un par un (évite la surcharge). Un échec ne
        //    défait pas l'appel, mais il se compte et se dit.
        let echecs = 0;
        for (const [key, file] of fileMap.entries()) {
          const [etuId, suiviId] = key.split(':').map(Number);
          try {
            await uploadJustificatifBySuivi(etuId, suiviId, file);
          } catch {
            echecs += 1;
          }
        }
        setPiecesEchouees(echecs);

        // Ce qui vient d'être écrit existe désormais en base.
        setExistantes(prev => {
          const n = new Set(prev);
          envois.forEach(e => e.presences.forEach(p => n.add(`${p.etudiant_id}:${e.sid}`)));
          return n;
        });
        setTouchees(new Set());
        setDirty(false);
        setFileMap(new Map());
        setSavedAt(new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }));
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Erreur lors de la sauvegarde.');
      } finally {
        setSaving(false);
      }
    },
    [cellMap, fileMap, touchees, existantes],
  );

  return {
    cellMap, fileMap, dirty, saving, error, savedAt, ignorees, piecesEchouees,
    getCell, setCell, toggleCell, attachFile, removeFile, resetAll, charger, save,
  };
}
