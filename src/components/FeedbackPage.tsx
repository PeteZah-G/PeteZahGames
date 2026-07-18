import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageSquare, Heart, Trash2, Send, Loader2, Lock } from "lucide-react";

interface Entry { id: string; content: string; username?: string; user_id: string; created_at: number; }
interface Comment { id: string; content: string; username?: string; avatar_url?: string; created_at: number; user_id?: string; }

function timeAgo(ts: number) {
  const d = Date.now() - ts;
  const m = Math.floor(d / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function FeedbackPage({ onNavigate }: { onNavigate: (url: string) => void }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [newFeedback, setNewFeedback] = useState("");
  const [posting, setPosting] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [liked, setLiked] = useState<Set<string>>(new Set());
  const [likeCounts, setLikeCounts] = useState<Record<string, number>>({});
  const [commentTarget, setCommentTarget] = useState<string | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [commentPosting, setCommentPosting] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  function loadEntries(p: number) {
    return fetch(`/api/feedback?page=${p}`, { credentials: "include" })
      .then(r => r.json())
      .then(fd => {
        const list = fd.entries || [];
        setEntries(list);
        setPage(fd.page || p);
        setTotalPages(fd.totalPages || 1);
        list.forEach((e: Entry) => {
          fetch(`/api/likes?type=feedback&targetId=${e.id}`, { credentials: "include" })
            .then(r => r.json())
            .then(d => {
              setLikeCounts(prev => ({ ...prev, [e.id]: d.count || 0 }));
              if (d.userLiked) setLiked(prev => { const n = new Set(prev); n.add(e.id); return n; });
            });
        });
      });
  }

  useEffect(() => {
    fetch("/api/me", { credentials: "include" })
      .then(r => r.json())
      .then(d => {
        if (d.user) {
          setAuthed(true);
          setUserId(d.user.id);
          setIsAdmin((d.user.is_admin ?? 0) >= 1 || !!d.user.is_owner);
          return loadEntries(1);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  async function post() {
    if (!newFeedback.trim()) return;
    setPosting(true);
    try {
      const r = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ content: newFeedback }),
      });
      if (r.ok) {
        const d = await r.json();
        setNewFeedback("");
        if (d.entry) {
          setEntries(p => [d.entry, ...p.filter(e => e.id !== d.entry.id)]);
        } else {
          await loadEntries(1);
        }
      }
    } finally { setPosting(false); }
  }

  async function del(id: string) {
    await fetch(`/api/feedback/${id}`, { method: "DELETE", credentials: "include" });
    setEntries(p => p.filter(e => e.id !== id));
  }

  async function like(id: string) {
    const r = await fetch("/api/likes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ type: "feedback", targetId: id }),
    });
    if (!r.ok) return;
    const d = await r.json();
    setLiked(p => {
      const n = new Set(p);
      if (d.liked) n.add(id); else n.delete(id);
      return n;
    });
    setLikeCounts(p => ({ ...p, [id]: typeof d.count === "number" ? d.count : (p[id] || 0) }));
  }

  async function openComments(id: string) {
    if (commentTarget === id) {
      setCommentTarget(null);
      return;
    }
    setCommentTarget(id);
    setCommentsLoading(true);
    setComments([]);
    fetch(`/api/comments?type=feedback&targetId=${encodeURIComponent(id)}`, { credentials: "include" })
      .then(r => r.json())
      .then(d => setComments(d.comments || []))
      .finally(() => setCommentsLoading(false));
  }

  async function deleteComment(commentId: string) {
    await fetch("/api/comment/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ commentId }),
    });
    setComments(p => p.filter(c => c.id !== commentId));
  }

  async function postComment() {
    if (!newComment.trim() || !commentTarget) return;
    setCommentPosting(true);
    try {
      const r = await fetch("/api/comment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ type: "feedback", targetId: commentTarget, content: newComment }),
      });
      if (r.ok) {
        const d = await r.json();
        setComments(p => [...p, d.comment || { id: d.id, content: newComment, created_at: Date.now(), username: "You" }]);
        setNewComment("");
      }
    } finally { setCommentPosting(false); }
  }

  function goUser(username?: string) {
    if (!username || username === "User" || username === "Anonymous") return;
    onNavigate(`petezah://user/@${username}`);
  }

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ background: "hsl(220 30% 7%)" }}>
      <div className="flex items-center gap-3 px-6 py-4 flex-shrink-0" style={{ borderBottom: "1px solid hsl(220 18% 11%)" }}>
        <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: "linear-gradient(135deg, hsl(215 85% 50%), hsl(250 75% 55%))" }}>
          <MessageSquare size={14} className="text-white" />
        </div>
        <div>
          <h1 className="text-sm font-bold" style={{ color: "hsl(220 15% 92%)" }}>Feedback</h1>
          <p className="text-[10px]" style={{ color: "hsl(220 15% 36%)" }}>
            All submissions
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3" style={{ scrollbarWidth: "thin", scrollbarColor: "hsl(220 18% 14%) transparent" }}>
        {!authed ? (
          /* Not signed in */
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
              style={{ background: "hsl(220 22% 12%)", border: "1px solid hsl(220 18% 16%)" }}>
              <Lock size={18} style={{ color: "hsl(220 15% 32%)" }} />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium mb-1" style={{ color: "hsl(220 15% 55%)" }}>Sign in to leave feedback</p>
              <p className="text-xs" style={{ color: "hsl(220 15% 32%)" }}>Sign in to view and submit community feedback</p>
            </div>
            <button onClick={() => onNavigate("petezah://account")}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold"
              style={{ background: "linear-gradient(135deg, hsl(215 85% 50%), hsl(250 75% 55%))", color: "#fff" }}>
              Sign In
            </button>
          </div>
        ) : (
          <>
            {/* Submit form */}
            <div className="p-4 rounded-2xl space-y-3"
              style={{ background: "hsl(220 22% 10%)", border: "1px solid hsl(220 18% 13%)" }}>
              <p className="text-xs" style={{ color: "hsl(220 15% 40%)" }}>
                Share a bug report, feature idea, or anything on your mind
              </p>
              <textarea
                value={newFeedback}
                onChange={e => setNewFeedback(e.target.value)}
                placeholder="What's on your mind?"
                rows={3}
                maxLength={2000}
                className="w-full text-sm py-2.5 px-3 rounded-xl outline-none resize-none"
                style={{ background: "hsl(220 25% 8%)", border: "1px solid hsl(220 18% 14%)", color: "hsl(220 15% 88%)", fontFamily: "inherit" }}
                onFocus={e => (e.currentTarget.style.borderColor = "hsl(215 85% 52% / 0.45)")}
                onBlur={e => (e.currentTarget.style.borderColor = "hsl(220 18% 14%)")} />
              <div className="flex items-center justify-between">
                <span className="text-[10px]" style={{ color: "hsl(220 15% 26%)" }}>{newFeedback.length}/2000</span>
                <button onClick={post} disabled={posting || !newFeedback.trim()}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all"
                  style={{
                    background: "linear-gradient(135deg, hsl(215 85% 50%), hsl(250 75% 55%))",
                    color: "#fff",
                    opacity: posting || !newFeedback.trim() ? 0.45 : 1,
                  }}>
                  {posting ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                  Submit
                </button>
              </div>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 size={20} className="animate-spin" style={{ color: "hsl(215 85% 52%)" }} />
              </div>
            ) : entries.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12" style={{ color: "hsl(220 15% 28%)" }}>
                <MessageSquare size={28} className="mb-2 opacity-25" />
                <p className="text-sm">No feedback yet</p>
              </div>
            ) : entries.map((entry, i) => (
              <motion.div key={entry.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                className="p-4 rounded-2xl"
                style={{ background: "hsl(220 22% 10%)", border: "1px solid hsl(220 18% 13%)" }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-bold"
                        style={{ background: "hsl(215 85% 38%)", color: "hsl(215 85% 88%)" }}>
                        {(entry.username || "A")[0].toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold leading-none" style={{ color: "hsl(215 85% 65%)" }}>
                          <button
                            type="button"
                            onClick={() => goUser(entry.username)}
                            style={{ background: "none", border: "none", padding: 0, cursor: entry.username ? "pointer" : "default", color: "inherit", font: "inherit" }}
                          >
                            {entry.username || "Anonymous"}
                          </button>
                          {entry.user_id === userId && (
                            <span className="ml-1.5 text-[9px] font-medium" style={{ color: "hsl(220 15% 42%)" }}>· you</span>
                          )}
                        </p>
                        <p className="text-[10px] mt-0.5" style={{ color: "hsl(220 15% 32%)" }}>{timeAgo(entry.created_at)}</p>
                      </div>
                    </div>
                    <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: "hsl(220 15% 70%)" }}>
                      {entry.content}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0 pt-0.5">
                    <button onClick={() => like(entry.id)}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] transition-all"
                      style={{
                        color: liked.has(entry.id) ? "hsl(0 65% 62%)" : "hsl(220 15% 34%)",
                        background: liked.has(entry.id) ? "hsl(0 65% 50% / 0.1)" : "transparent",
                      }}>
                      <Heart size={10} fill={liked.has(entry.id) ? "currentColor" : "none"} />
                      {(likeCounts[entry.id] || 0) > 0 && <span>{likeCounts[entry.id]}</span>}
                    </button>
                    <button onClick={() => openComments(entry.id)}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] transition-all"
                      style={{ color: commentTarget === entry.id ? "hsl(215 85% 62%)" : "hsl(220 15% 34%)" }}>
                      <MessageSquare size={10} />
                    </button>
                    {(isAdmin || entry.user_id === userId) && (
                      <button onClick={() => del(entry.id)}
                        className="p-1.5 rounded-lg transition-all"
                        style={{ color: "hsl(220 15% 26%)" }}
                        onMouseEnter={e => (e.currentTarget.style.color = "hsl(0 65% 52%)")}
                        onMouseLeave={e => (e.currentTarget.style.color = "hsl(220 15% 26%)")}>
                        <Trash2 size={11} />
                      </button>
                    )}
                  </div>
                </div>
              <AnimatePresence>
                {commentTarget === entry.id && (
                  <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden">
                    <div className="px-4 pb-4 pt-3" style={{ borderTop: "1px solid hsl(220 18% 13%)" }}>
                      {commentsLoading ? (
                        <div className="flex justify-center py-3"><Loader2 size={14} className="animate-spin" style={{ color: "hsl(215 85% 52%)" }} /></div>
                      ) : comments.length === 0 ? (
                        <p className="text-[10px] text-center py-2" style={{ color: "hsl(220 15% 30%)" }}>No comments yet</p>
                      ) : (
                        <div className="space-y-2 mb-3">
                          {comments.map(c => (
                            <div key={c.id} className="flex gap-2 items-start w-full">
                              <div className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center text-[8px] font-bold" style={{ background: "hsl(215 85% 40%)", color: "hsl(215 85% 80%)" }}>
                                {(c.username || "?")[0].toUpperCase()}
                              </div>
                              <div className="flex-1">
                              <button
                                type="button"
                                onClick={() => goUser(c.username)}
                                className="text-[10px] font-semibold mr-1.5"
                                style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "hsl(215 85% 60%)", font: "inherit" }}
                              >
                                {c.username || "User"}
                              </button>
                              <span className="text-[11px]" style={{ color: "hsl(220 15% 62%)" }}>{c.content}</span>
                            </div>
                            {isAdmin && (
                              <button onClick={() => deleteComment(c.id)}
                                className="p-1 rounded transition-all flex-shrink-0"
                                style={{ color: "hsl(220 15% 26%)" }}
                                onMouseEnter={e => (e.currentTarget.style.color = "hsl(0 65% 52%)")}
                                onMouseLeave={e => (e.currentTarget.style.color = "hsl(220 15% 26%)")}>
                                <Trash2 size={9} />
                              </button>
                            )}
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="flex gap-2 items-center">
                        <input value={newComment} onChange={e => setNewComment(e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter") postComment(); }}
                          placeholder="Add a comment..."
                          className="flex-1 text-[11px] px-2.5 py-1.5 rounded-lg outline-none"
                          style={{ background: "hsl(220 25% 9%)", border: "1px solid hsl(220 18% 15%)", color: "hsl(220 15% 88%)", fontFamily: "inherit" }} />
                        <button onClick={postComment} disabled={commentPosting || !newComment.trim()}
                          className="p-1.5 rounded-lg transition-all"
                          style={{ background: "hsl(215 85% 52% / 0.15)", border: "1px solid hsl(215 85% 52% / 0.2)", opacity: commentPosting || !newComment.trim() ? 0.4 : 1 }}>
                          {commentPosting ? <Loader2 size={11} className="animate-spin" style={{ color: "hsl(215 85% 60%)" }} /> : <Send size={11} style={{ color: "hsl(215 85% 60%)" }} />}
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
              </motion.div>
            ))}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-3 pt-2">
                <button disabled={page <= 1} onClick={() => { setLoading(true); loadEntries(page - 1).finally(() => setLoading(false)); }}
                  className="px-3 py-1.5 rounded-lg text-[11px] font-medium disabled:opacity-30"
                  style={{ background: "hsl(220 22% 12%)", border: "1px solid hsl(220 18% 15%)", color: "hsl(220 15% 60%)" }}>
                  Previous
                </button>
                <span className="text-[10px]" style={{ color: "hsl(220 15% 35%)" }}>{page} / {totalPages}</span>
                <button disabled={page >= totalPages} onClick={() => { setLoading(true); loadEntries(page + 1).finally(() => setLoading(false)); }}
                  className="px-3 py-1.5 rounded-lg text-[11px] font-medium disabled:opacity-30"
                  style={{ background: "hsl(220 22% 12%)", border: "1px solid hsl(220 18% 15%)", color: "hsl(220 15% 60%)" }}>
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}