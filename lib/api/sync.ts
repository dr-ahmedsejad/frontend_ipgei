import { apiFetch } from '@/lib/api';

/**
 * Publication de l'état local vers le portail en ligne.
 *
 * Le local est l'autorité, le portail son reflet : la synchronisation ne va que
 * dans ce sens, et le serveur refuse de partir d'un miroir. Les tables de la
 * boîte de réception — ce que les enseignants déposent en ligne — sont exclues
 * du transfert et survivent donc à la publication.
 */

/** Rôle de l'instance, lu AVANT la connexion pour savoir à qui l'on parle. */
export interface InfoInstance {
  role:          'local' | 'mirror';
  mirror_mode:   boolean;
  nom:           string;
  lecture_seule: boolean;
}

/** Ce que rend une publication — `dump_ready` quand aucune cible n'est réglée. */
export interface ResultatSync {
  status:          'synced' | 'dump_ready' | 'error';
  transferred:     boolean;
  size:            number;
  sha256:          string;
  duree_s:         number;
  vps?:            string;
  detail?:         string;
  tables_exclues?: string[];
}

export interface LigneHistoriqueSync {
  id:          number;
  cree_le:     string;
  par:         string;
  statut:      'synced' | 'dump_ready' | 'error';
  transferred: boolean;
  size:        number;
  sha256:      string;
  duree_s:     number;
  vps:         string;
  erreur:      string;
}

export const syncApi = {
  /** Public : ni jeton ni rôle requis, l'écran s'en sert dès le chargement. */
  instance: () => apiFetch<InfoInstance>('/api/v1/instance/'),

  /** Réservé aux administrateurs. Chaque appel laisse une trace, même en échec. */
  publier: () => apiFetch<ResultatSync>('/api/v1/sync/push/', { method: 'POST' }),

  historique: () => apiFetch<LigneHistoriqueSync[]>('/api/v1/sync/history/'),
};
