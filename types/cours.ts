/** Types du module Cours (fil pédagogique prof ↔ étudiants). */

export type CoursPieceType = 'image' | 'video' | 'lien' | 'fichier';

export interface CoursPiece {
    id: number;
    type: CoursPieceType;
    url: string;          // lien / vidéo externe
    fichier_url: string;  // fichier uploadé (URL absolue)
    libelle: string;
}

export interface CoursReponse {
    id: number;
    cours: number;
    parent: number | null;        // réponse ciblée (fil imbriqué)
    contenu: string;
    auteur: number | null;
    auteur_nom: string;
    auteur_role: string;
    parent_auteur_nom: string;    // nom de l'auteur ciblé (« En réponse à … »)
    date_creation: string;
    date_modification: string | null;   // non nul = commentaire modifié
}

/** Prévisualisation d'un lien externe (embed vidéo + OpenGraph). */
export interface LinkPreview {
    url: string;
    titre: string;
    description: string;
    image: string;
    site: string;
    type: 'lien' | 'video' | 'image';
    embed_url: string;            // non vide = iframe player (YouTube / Vimeo)
}

export interface Cours {
    id: number;
    em: number;
    em_code: string;
    em_intitule: string;
    annee_universitaire: string;
    titre: string;
    contenu: string;
    auteur: number | null;
    auteur_nom: string;
    auteur_role: string;
    pieces: CoursPiece[];
    reponses: CoursReponse[];
    nb_reponses: number;
    date_creation: string;
    date_modification: string;
}

/** EM proposé à l'utilisateur (enseigné et/ou où il est inscrit). */
export interface CoursEM {
    id: number;
    code_em: string;
    intitule: string;
    peut_publier: boolean;   // true = l'utilisateur enseigne cet EM
}
