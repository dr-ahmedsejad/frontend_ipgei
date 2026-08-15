'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    BookOpen, Send, Paperclip, Link2, FileText, Image as ImageIcon, Video,
    Trash2, Loader2, X, Plus, MessageSquare, ChevronDown, Download,
    CornerDownRight, ExternalLink, Pencil, Check,
} from 'lucide-react';
import { getStoredUser } from '@/lib/auth';
import { coursApi } from '@/lib/api/cours';
import { validateUpload } from '@/lib/file-validation';
import { useToast, ToastContainer } from '@/components/ui/Toast';
import { ConfirmModal } from '@/components/ConfirmModal';
import type { Cours, CoursPiece, CoursReponse } from '@/types/cours';

/** Réponse + ses réponses ciblées (arbre construit côté client depuis `parent`). */
interface ReponseNode extends CoursReponse { enfants: ReponseNode[] }

function buildTree(list: CoursReponse[]): ReponseNode[] {
    const map = new Map<number, ReponseNode>();
    list.forEach(r => map.set(r.id, { ...r, enfants: [] }));
    const roots: ReponseNode[] = [];
    map.forEach(n => {
        const parent = n.parent != null ? map.get(n.parent) : undefined;
        if (parent) parent.enfants.push(n); else roots.push(n);
    });
    return roots;
}

const GREEN = '#006633';
const ACCEPT = 'image/*,video/*,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.zip';

function fmtDate(iso?: string): string {
    if (!iso) return '';
    const d = new Date(iso);
    return isNaN(d.getTime()) ? '' : d.toLocaleString('fr-FR',
        { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function roleLabel(r?: string): string {
    if (r === 'etudiant') return 'Étudiant';
    if (r === 'enseignant') return 'Enseignant';
    return r || '';
}

// ── Pièce jointe ────────────────────────────────────────────────────────────
function PieceView({ p }: { p: CoursPiece }) {
    if (p.type === 'image' && p.fichier_url) {
        return (
            <a href={p.fichier_url} target="_blank" rel="noreferrer" className="block">
                {/* eslint-disable-next-line @next/next/no-img-element -- média utilisateur, pas d'optimisation next/image */}
                <img src={p.fichier_url} alt={p.libelle || 'image'}
                    className="max-h-64 rounded-lg border border-slate-200 object-contain" />
            </a>
        );
    }
    if (p.type === 'video' && p.fichier_url) {
        return <video src={p.fichier_url} controls className="max-h-64 rounded-lg border border-slate-200 w-full" />;
    }
    if (p.type === 'fichier' && p.fichier_url) {
        return (
            <a href={p.fichier_url} target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-2 text-sm text-[#006633] hover:underline border border-slate-200 rounded-lg px-3 py-2">
                <FileText size={15} /> {p.libelle || 'Fichier'} <Download size={13} />
            </a>
        );
    }
    // liens externes (lien / vidéo externe) → prévisualisation
    return <LinkPreviewView url={p.url} libelle={p.libelle} />;
}

// ── Prévisualisation d'un lien externe (embed vidéo / carte OpenGraph) ────────
function LinkPreviewView({ url, libelle }: { url: string; libelle?: string }) {
    const { data, isLoading } = useQuery({
        queryKey: ['cours', 'apercu', url] as const,
        queryFn: () => coursApi.apercuLien(url),
        enabled: !!url,
        staleTime: 6 * 3600 * 1000,
        retry: false,
    });

    if (isLoading) {
        return <div className="h-20 rounded-lg border border-slate-200 bg-slate-50 animate-pulse" />;
    }

    // Vidéo embarquée (YouTube / Vimeo)
    if (data?.embed_url) {
        return (
            <div className="rounded-lg overflow-hidden border border-slate-200">
                <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
                    <iframe src={data.embed_url} title={data.titre || 'vidéo'}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen className="absolute inset-0 w-full h-full" />
                </div>
                <a href={url} target="_blank" rel="noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-500 hover:text-[#006633] truncate">
                    <Video size={12} className="shrink-0" /> {libelle || data.titre || url}
                </a>
            </div>
        );
    }

    // Carte OpenGraph (titre / image / description)
    if (data && (data.titre || data.image)) {
        return (
            <a href={url} target="_blank" rel="noreferrer"
                className="block rounded-lg border border-slate-200 overflow-hidden hover:border-[#006633]/50 transition">
                {data.image && (
                    // eslint-disable-next-line @next/next/no-img-element -- miniature OG externe
                    <img src={data.image} alt="" onError={e => { e.currentTarget.style.display = 'none'; }}
                        className="w-full max-h-48 object-cover" />
                )}
                <div className="p-3">
                    <p className="text-[10px] uppercase tracking-wide text-slate-400 truncate">{data.site}</p>
                    <p className="text-sm font-semibold text-slate-800 line-clamp-2">{data.titre || url}</p>
                    {data.description && (
                        <p className="text-xs text-slate-500 line-clamp-2 mt-0.5">{data.description}</p>
                    )}
                </div>
            </a>
        );
    }

    // Repli : lien simple
    return (
        <a href={url} target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-2 text-sm text-blue-700 hover:underline border border-slate-200 rounded-lg px-3 py-2 break-all">
            <Link2 size={15} className="shrink-0" /> {libelle || url} <ExternalLink size={13} className="shrink-0" />
        </a>
    );
}

// ── Zone de réponse (au cours, ou ciblée sur une réponse via `parentId`) ──────
function ReponseForm({ coursId, parentId, targetNom, onSent, onCancel, autoFocus }: {
    coursId: number; parentId?: number; targetNom?: string;
    onSent: () => void; onCancel?: () => void; autoFocus?: boolean;
}) {
    const toast = useToast();
    const [txt, setTxt] = useState('');
    const mut = useMutation({
        mutationFn: () => coursApi.repondre(coursId, txt.trim(), parentId),
        onSuccess: () => { setTxt(''); onSent(); },
        onError: (e) => toast.error(e instanceof Error ? e.message : 'Erreur envoi réponse.'),
    });
    return (
        <div className="flex items-center gap-2 mt-2">
            <input
                autoFocus={autoFocus}
                value={txt} onChange={e => setTxt(e.target.value)}
                onKeyDown={e => {
                    if (e.key === 'Enter' && txt.trim()) mut.mutate();
                    if (e.key === 'Escape' && onCancel) onCancel();
                }}
                placeholder={targetNom ? `Répondre à ${targetNom}…` : 'Écrire une réponse…'}
                className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#006633]/30" />
            <button onClick={() => txt.trim() && mut.mutate()} disabled={mut.isPending || !txt.trim()}
                className="inline-flex items-center gap-1 text-white text-sm font-semibold px-3 py-2 rounded-lg disabled:opacity-50"
                style={{ background: GREEN }}>
                {mut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            </button>
            {onCancel && (
                <button onClick={onCancel} title="Annuler"
                    className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100">
                    <X size={15} />
                </button>
            )}
        </div>
    );
}

// ── Réponse (récursive) : entête + contenu + actions (Répondre/Modifier) + enfants ─
function ReponseItem({ node, coursId, depth, onChanged }: {
    node: ReponseNode; coursId: number; depth: number; onChanged: () => void;
}) {
    const user = getStoredUser();
    const toast = useToast();
    const [replying, setReplying] = useState(false);
    const [editing, setEditing] = useState(false);
    const [editTxt, setEditTxt] = useState(node.contenu);
    const estProprietaire = user?.role === 'admin' || (node.auteur != null && node.auteur === user?.id);

    const editMut = useMutation({
        mutationFn: () => coursApi.modifierReponse(coursId, node.id, editTxt.trim()),
        onSuccess: () => { setEditing(false); onChanged(); },
        onError: (e) => toast.error(e instanceof Error ? e.message : 'Erreur lors de la modification.'),
    });
    const cancelEdit = () => { setEditing(false); setEditTxt(node.contenu); };

    return (
        <div className={depth > 0 ? 'ml-4 pl-3 border-l-2 border-slate-100' : ''}>
            <div className="text-sm bg-slate-50 rounded-lg px-3 py-2">
                <div className="flex items-center flex-wrap gap-x-2">
                    <span className="font-semibold text-slate-700">{node.auteur_nom || '—'}</span>
                    <span className="text-[10px] text-slate-400 uppercase">{roleLabel(node.auteur_role)}</span>
                    {node.parent_auteur_nom && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] text-slate-400">
                            <CornerDownRight size={11} /> {node.parent_auteur_nom}
                        </span>
                    )}
                    <span className="text-[10px] text-slate-400">{fmtDate(node.date_creation)}</span>
                </div>

                {editing ? (
                    <div className="flex items-center gap-2 mt-1">
                        <input autoFocus value={editTxt} onChange={e => setEditTxt(e.target.value)}
                            onKeyDown={e => {
                                if (e.key === 'Enter' && editTxt.trim()) editMut.mutate();
                                if (e.key === 'Escape') cancelEdit();
                            }}
                            className="flex-1 border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#006633]/30" />
                        <button onClick={() => editTxt.trim() && editMut.mutate()} disabled={editMut.isPending || !editTxt.trim()}
                            title="Enregistrer"
                            className="inline-flex items-center text-white text-xs font-semibold px-2.5 py-1.5 rounded-lg disabled:opacity-50"
                            style={{ background: GREEN }}>
                            {editMut.isPending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                        </button>
                        <button onClick={cancelEdit} title="Annuler"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"><X size={14} /></button>
                    </div>
                ) : (
                    <p className="text-slate-700 whitespace-pre-wrap">
                        {node.contenu}
                        {node.date_modification && (
                            <span className="ml-1.5 text-[10px] italic text-slate-400"
                                title={`Modifié le ${fmtDate(node.date_modification)}`}>
                                (modifié le {fmtDate(node.date_modification)})
                            </span>
                        )}
                    </p>
                )}

                {!editing && (
                    <div className="mt-1 flex items-center gap-3">
                        <button onClick={() => setReplying(v => !v)}
                            className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-400 hover:text-[#006633]">
                            <CornerDownRight size={11} /> Répondre
                        </button>
                        {estProprietaire && (
                            <button onClick={() => { setEditTxt(node.contenu); setEditing(true); }}
                                className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-400 hover:text-[#006633]">
                                <Pencil size={11} /> Modifier
                            </button>
                        )}
                    </div>
                )}
            </div>

            {replying && (
                <ReponseForm coursId={coursId} parentId={node.id} targetNom={node.auteur_nom} autoFocus
                    onSent={() => { setReplying(false); onChanged(); }}
                    onCancel={() => setReplying(false)} />
            )}

            {node.enfants.length > 0 && (
                <div className="mt-2 space-y-2">
                    {node.enfants.map(c => (
                        <ReponseItem key={c.id} node={c} coursId={coursId} depth={depth + 1} onChanged={onChanged} />
                    ))}
                </div>
            )}
        </div>
    );
}

// ── Carte cours ─────────────────────────────────────────────────────────────
function CoursCard({ cours, onChanged }: { cours: Cours; onChanged: () => void }) {
    const user = getStoredUser();
    const toast = useToast();
    const [openReplies, setOpenReplies] = useState(false);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const peutSupprimer = user?.role === 'admin' || (cours.auteur != null && cours.auteur === user?.id);

    const delMut = useMutation({
        mutationFn: () => coursApi.remove(cours.id),
        onSuccess: () => { setConfirmOpen(false); toast.success('Cours supprimé'); onChanged(); },
        onError: (e) => toast.error(e instanceof Error ? e.message : 'Erreur suppression.'),
    });

    const nbPieces = cours.pieces.length;
    const detailSuppr = [
        cours.nb_reponses > 0 ? `${cours.nb_reponses} réponse${cours.nb_reponses > 1 ? 's' : ''}` : '',
        nbPieces > 0 ? `${nbPieces} pièce${nbPieces > 1 ? 's' : ''} jointe${nbPieces > 1 ? 's' : ''}` : '',
    ].filter(Boolean).join(' et ');

    return (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
            <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                    <span className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold"
                        style={{ background: GREEN }}>
                        {(cours.auteur_nom || '?').slice(0, 2).toUpperCase()}
                    </span>
                    <div>
                        <p className="text-sm font-semibold text-slate-800">{cours.auteur_nom || '—'}
                            <span className="ml-2 text-[10px] font-medium text-slate-400 uppercase">{roleLabel(cours.auteur_role)}</span>
                        </p>
                        <p className="text-[11px] text-slate-400">{fmtDate(cours.date_creation)}</p>
                    </div>
                </div>
                {peutSupprimer && (
                    <button onClick={() => setConfirmOpen(true)}
                        disabled={delMut.isPending} title="Supprimer le cours"
                        className="p-1.5 rounded-lg text-red-400 hover:bg-red-50 hover:text-red-600 transition">
                        <Trash2 size={15} />
                    </button>
                )}
            </div>

            {cours.titre && <h3 className="mt-3 font-bold text-slate-900">{cours.titre}</h3>}
            {cours.contenu && <p className="mt-1 text-sm text-slate-700 whitespace-pre-wrap">{cours.contenu}</p>}

            {cours.pieces.length > 0 && (
                <div className="mt-3 flex flex-col gap-2">
                    {cours.pieces.map(p => <PieceView key={p.id} p={p} />)}
                </div>
            )}

            <button onClick={() => setOpenReplies(o => !o)}
                className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-[#006633]">
                <MessageSquare size={13} />
                {cours.nb_reponses} réponse{cours.nb_reponses > 1 ? 's' : ''}
                <ChevronDown size={12} className={openReplies ? 'rotate-180 transition' : 'transition'} />
            </button>

            {openReplies && (
                <div className="mt-2 border-t border-slate-100 pt-2 space-y-2">
                    {buildTree(cours.reponses).map(n => (
                        <ReponseItem key={n.id} node={n} coursId={cours.id} depth={0} onChanged={onChanged} />
                    ))}
                    <ReponseForm coursId={cours.id} onSent={onChanged} />
                </div>
            )}

            <ConfirmModal
                open={confirmOpen}
                variant="danger"
                title="Supprimer ce cours ?"
                message={
                    `« ${cours.titre || 'Cours sans titre'} » sera définitivement supprimé`
                    + (detailSuppr ? `, avec ${detailSuppr}.` : '.')
                    + ' Cette action est irréversible.'
                }
                confirmLabel="Supprimer définitivement"
                loading={delMut.isPending}
                onConfirm={() => delMut.mutate()}
                onCancel={() => { if (!delMut.isPending) setConfirmOpen(false); }}
            />
        </div>
    );
}

// ── Composant principal ─────────────────────────────────────────────────────
export default function CoursFeed() {
    const user = getStoredUser();
    const annee = user?.annee_universitaire ?? '';
    const toast = useToast();
    const qc = useQueryClient();

    const [emId, setEmId] = useState<number | null>(null);
    const [titre, setTitre] = useState('');
    const [contenu, setContenu] = useState('');
    const [files, setFiles] = useState<File[]>([]);
    const [liens, setLiens] = useState<string[]>([]);
    const [lienInput, setLienInput] = useState('');

    const emsQuery = useQuery({
        queryKey: ['cours', 'mes-ems', annee] as const,
        queryFn: () => coursApi.mesEms(annee),
    });
    const ems = emsQuery.data ?? [];
    const premierEmId = emsQuery.data?.[0]?.id ?? null;
    useEffect(() => { if (emId == null && premierEmId != null) setEmId(premierEmId); }, [premierEmId, emId]);
    const selectedEm = ems.find(e => e.id === emId) ?? null;

    const coursQuery = useQuery({
        queryKey: ['cours', 'list', emId, annee] as const,
        queryFn: () => coursApi.list(emId!, annee),
        enabled: !!emId,
    });
    const cours = coursQuery.data ?? [];

    const refresh = () => qc.invalidateQueries({ queryKey: ['cours', 'list', emId, annee] });

    const createMut = useMutation({
        mutationFn: () => {
            const fd = new FormData();
            fd.append('em', String(emId));
            if (annee) fd.append('annee_universitaire', annee);
            fd.append('titre', titre.trim());
            fd.append('contenu', contenu.trim());
            files.forEach(f => fd.append('fichiers', f));
            if (liens.length) fd.append('liens', JSON.stringify(liens.map(url => ({ url }))));
            return coursApi.create(fd);
        },
        onSuccess: () => {
            setTitre(''); setContenu(''); setFiles([]); setLiens([]); setLienInput('');
            refresh(); toast.success('Cours publié');
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : 'Erreur lors de la publication.'),
    });

    function onPickFiles(e: React.ChangeEvent<HTMLInputElement>) {
        const picked = Array.from(e.target.files ?? []);
        const ok: File[] = [];
        for (const f of picked) {
            const err = validateUpload(f, { maxSizeMb: 25, accept: ACCEPT });
            if (err) { toast.error(`${f.name} : ${err}`); continue; }
            ok.push(f);
        }
        setFiles(prev => [...prev, ...ok]);
        e.target.value = '';
    }

    function addLien() {
        const u = lienInput.trim();
        if (!u) return;
        setLiens(prev => [...prev, u]);
        setLienInput('');
    }

    const rienASoumettre = !contenu.trim() && files.length === 0 && liens.length === 0;

    return (
        <div className="p-6 max-w-3xl mx-auto space-y-5">
            <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: 'linear-gradient(135deg,#004d24,#006633)' }}>
                    <BookOpen size={16} className="text-white" />
                </div>
                <div>
                    <h1 className="text-xl font-bold text-slate-900">Cours &amp; échanges</h1>
                    <p className="text-xs text-slate-400">{annee || 'Année en cours'}</p>
                </div>
            </div>

            {/* Sélecteur d'EM */}
            <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Élément de module</label>
                {emsQuery.isLoading ? (
                    <div className="h-10 bg-slate-100 rounded-lg animate-pulse" />
                ) : ems.length === 0 ? (
                    <p className="text-sm text-slate-400">Aucun EM disponible pour cette année.</p>
                ) : (
                    <select value={emId ?? ''} onChange={e => setEmId(Number(e.target.value))}
                        className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#006633]/30">
                        {ems.map(e => (
                            <option key={e.id} value={e.id}>{e.code_em} — {e.intitule}</option>
                        ))}
                    </select>
                )}
            </div>

            {/* Formulaire de publication (enseignant de l'EM uniquement) */}
            {selectedEm?.peut_publier && (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-3">
                    <p className="text-sm font-semibold text-slate-700">Publier un cours</p>
                    <input value={titre} onChange={e => setTitre(e.target.value)} placeholder="Titre (optionnel)"
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#006633]/30" />
                    <textarea value={contenu} onChange={e => setContenu(e.target.value)} rows={3}
                        placeholder="Contenu, consignes, description…"
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#006633]/30" />

                    {/* Liens externes */}
                    <div className="flex items-center gap-2">
                        <input value={lienInput} onChange={e => setLienInput(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addLien(); } }}
                            placeholder="Ajouter un lien (YouTube, Drive, site…)"
                            className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#006633]/30" />
                        <button onClick={addLien} type="button"
                            className="inline-flex items-center gap-1 text-sm px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">
                            <Link2 size={14} /> Ajouter
                        </button>
                    </div>
                    {liens.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                            {liens.map((l, i) => (
                                <span key={i} className="inline-flex items-center gap-1 text-xs bg-blue-50 text-blue-700 rounded-full px-2.5 py-1 max-w-full">
                                    <Link2 size={12} /> <span className="truncate max-w-[16rem]">{l}</span>
                                    <button onClick={() => setLiens(prev => prev.filter((_, j) => j !== i))}><X size={12} /></button>
                                </span>
                            ))}
                        </div>
                    )}

                    {/* Fichiers */}
                    <div className="flex items-center gap-2">
                        <label className="inline-flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 cursor-pointer">
                            <Paperclip size={14} /> Image / vidéo / fichier
                            <input type="file" multiple accept={ACCEPT} onChange={onPickFiles} className="hidden" />
                        </label>
                        <span className="text-[11px] text-slate-400">max 25 Mo / fichier</span>
                    </div>
                    {files.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                            {files.map((f, i) => (
                                <span key={i} className="inline-flex items-center gap-1 text-xs bg-slate-100 text-slate-700 rounded-full px-2.5 py-1">
                                    {f.type.startsWith('image/') ? <ImageIcon size={12} /> : f.type.startsWith('video/') ? <Video size={12} /> : <FileText size={12} />}
                                    <span className="truncate max-w-[12rem]">{f.name}</span>
                                    <button onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))}><X size={12} /></button>
                                </span>
                            ))}
                        </div>
                    )}

                    <div className="flex justify-end">
                        <button onClick={() => createMut.mutate()} disabled={createMut.isPending || rienASoumettre}
                            className="inline-flex items-center gap-2 text-white text-sm font-bold px-4 py-2 rounded-lg disabled:opacity-50"
                            style={{ background: GREEN }}>
                            {createMut.isPending ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
                            Publier
                        </button>
                    </div>
                </div>
            )}

            {/* Fil des cours */}
            {emId && (
                coursQuery.isLoading ? (
                    <div className="text-center py-10 text-slate-400 text-sm">
                        <Loader2 size={18} className="animate-spin mx-auto mb-2" /> Chargement…
                    </div>
                ) : cours.length === 0 ? (
                    <div className="text-center py-10 text-slate-400 text-sm bg-white rounded-xl border border-slate-200">
                        <BookOpen size={28} className="mx-auto mb-2 text-slate-300" />
                        Aucun cours publié pour cet EM.
                    </div>
                ) : (
                    <div className="space-y-4">
                        {cours.map(c => <CoursCard key={c.id} cours={c} onChanged={refresh} />)}
                    </div>
                )
            )}

            <ToastContainer toasts={toast.toasts} onClose={toast.removeToast} />
        </div>
    );
}
