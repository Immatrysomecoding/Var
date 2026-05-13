import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Share2, AlertCircle, Loader } from 'lucide-react';
import { BreathingDot } from '../components/BreathingDot';
import { useHlsPlayer } from '../hooks/useHlsPlayer';
import {
  getSession, getClips, joinSession, leaveSession, getHlsUrl,
  type Session, type Clip,
} from '../lib/api';

// The sessionId is extracted from the URL path: /f/:sessionId
function getSessionIdFromPath(): string | null {
  const parts = window.location.pathname.split('/');
  const idx = parts.indexOf('f');
  return idx !== -1 && parts[idx + 1] ? parts[idx + 1] : null;
}

function formatAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <div style={{ width: size, height: size, minWidth: size, background: '#00024F', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ fontFamily: "'Akira Expanded', sans-serif", fontSize: size * 0.38, color: '#fff', fontWeight: 700 }}>L</span>
    </div>
  );
}

function FullScreenMessage({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle?: string }) {
  return (
    <div style={{ minHeight: '100vh', background: '#F4F5F6', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24, fontFamily: "'Unbounded', sans-serif" }}>
      {icon}
      <p style={{ color: '#010028', fontSize: 15, fontFamily: "'Akira Expanded', sans-serif", letterSpacing: '0.05em', margin: 0, textAlign: 'center' }}>{title}</p>
      {subtitle && <p style={{ color: '#BABABA', fontSize: 12, margin: 0, textAlign: 'center' }}>{subtitle}</p>}
    </div>
  );
}

export default function Spectator() {
  const sessionId = getSessionIdFromPath();

  const [session, setSession] = useState<Session | null>(null);
  const [clips, setClips] = useState<Clip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [shared, setShared] = useState(false);
  const [activeClipId, setActiveClipId] = useState<string | null>(null);

  // ─ Load session & join ────────────────────────────────────────────────────
  useEffect(() => {
    if (!sessionId) { setError('Invalid session link.'); setLoading(false); return; }

    getSession(sessionId)
      .then((s) => { setSession(s); return s; })
      .then((s) => {
        joinSession(s.session_id).catch(() => {});
        return getClips({ session_id: s.session_id });
      })
      .then(setClips)
      .catch(() => setError('Session not found or expired.'))
      .finally(() => setLoading(false));

    return () => { if (sessionId) leaveSession(sessionId).catch(() => {}); };
  }, [sessionId]);

  // ─ Poll session every 10s for viewer count updates ────────────────────────
  useEffect(() => {
    if (!sessionId) return;
    const t = setInterval(() => {
      getSession(sessionId).then(setSession).catch(() => {});
      getClips({ session_id: sessionId }).then(setClips).catch(() => {});
    }, 10_000);
    return () => clearInterval(t);
  }, [sessionId]);

  // ─ HLS player ─────────────────────────────────────────────────────────────
  const hlsSrc = session?.stream_path ? getHlsUrl(session.stream_path) : null;
  const { videoRef } = useHlsPlayer(hlsSrc);

  // ─ Share ──────────────────────────────────────────────────────────────────
  const handleShare = () => {
    setShared(true);
    const url = window.location.href;
    if (navigator.share) {
      navigator.share({ title: `Lavaro — ${session?.field_name ?? 'Live Match'}`, url }).catch(() => {});
    } else {
      navigator.clipboard.writeText(url).catch(() => {});
    }
    setTimeout(() => setShared(false), 2000);
  };

  // ─ Guards ─────────────────────────────────────────────────────────────────
  if (loading) return <FullScreenMessage icon={<Loader size={28} color="#183DEB" className="animate-spin" />} title="LOADING" subtitle="Connecting to live match…" />;
  if (error || !session) return <FullScreenMessage icon={<AlertCircle size={28} color="#EF4444" />} title="NOT FOUND" subtitle={error ?? 'Session unavailable.'} />;

  return (
    <div style={{ minHeight: '100vh', background: '#F4F5F6', fontFamily: "'Unbounded', sans-serif", display: 'flex', flexDirection: 'column', maxWidth: 480, margin: '0 auto' }}>

      {/* ── Header ── */}
      <header style={{ background: '#fff', padding: '12px 16px', borderBottom: '1px solid rgba(219,223,226,0.8)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <LogoMark size={28} />
        <div style={{ flex: 1 }}>
          <p style={{ color: 'rgba(0,2,79,0.5)', fontSize: 11, margin: 0 }}>{session.venue_name ?? 'Venue'}</p>
          <p style={{ color: '#010028', fontSize: 14, fontWeight: 500, margin: 0 }}>{session.field_name ?? 'Court'}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#183DEB', padding: '5px 12px', borderRadius: 99 }}>
          <BreathingDot color="#fff" size={6} />
          <span style={{ color: '#fff', fontSize: 11 }}>LIVE</span>
        </div>
      </header>

      {/* ── Score panel ── */}
      <div style={{ padding: '16px 16px 0' }}>
        <div style={{ background: '#00024F', borderRadius: 20, padding: 16, color: '#fff' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
              <BreathingDot color="#183DEB" size={7} />
              <span style={{ fontSize: 10, color: '#BABABA' }}>LIVE MATCH</span>
            </div>
            {(session.viewer_count ?? 0) > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <BreathingDot color="#22c55e" size={6} />
                <span style={{ fontSize: 10, color: '#BABABA' }}>{session.viewer_count} watching</span>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
            <div style={{ flex: 1, textAlign: 'center' }}>
              <p style={{ fontSize: 11, color: '#BABABA', margin: '0 0 4px' }}>TEAM A</p>
              <p style={{ fontFamily: "'Akira Expanded', sans-serif", fontSize: 44, fontWeight: 700, letterSpacing: '0.05em', color: '#fff', lineHeight: 1, margin: 0 }}>—</p>
            </div>
            <div style={{ textAlign: 'center', padding: '0 12px' }}>
              <div style={{ width: 1, height: 48, background: '#183DEB', margin: '0 auto' }} />
              <p style={{ color: '#BABABA', fontSize: 10, margin: '6px 0 0' }}>Game 1</p>
            </div>
            <div style={{ flex: 1, textAlign: 'center' }}>
              <p style={{ fontSize: 11, color: '#BABABA', margin: '0 0 4px' }}>TEAM B</p>
              <p style={{ fontFamily: "'Akira Expanded', sans-serif", fontSize: 44, fontWeight: 700, letterSpacing: '0.05em', color: '#fff', lineHeight: 1, margin: 0 }}>—</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Video ── */}
      <div style={{ padding: '16px 16px 0' }}>
        <div style={{ position: 'relative', borderRadius: 16, overflow: 'hidden', aspectRatio: '16/9', background: '#000' }}>
          {hlsSrc ? (
            <video ref={videoRef} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} playsInline muted />
          ) : (
            <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg,#00024F,#010028)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Play size={40} color="rgba(24,61,235,0.4)" />
            </div>
          )}
          {/* Live badge overlay */}
          <div style={{ position: 'absolute', top: 8, left: 8, background: 'rgba(1,0,40,0.75)', borderRadius: 99, padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 5 }}>
            <BreathingDot color="#EF4444" size={6} />
            <span style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 10, color: '#fff' }}>LIVE</span>
          </div>
          {(session.viewer_count ?? 0) > 0 && (
            <div style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(1,0,40,0.75)', borderRadius: 99, padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 5 }}>
              <BreathingDot color="#22c55e" size={6} />
              <span style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 10, color: '#fff' }}>{session.viewer_count}</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Share ── */}
      <div style={{ padding: '12px 16px 0' }}>
        <motion.button
          onClick={handleShare}
          whileTap={{ scale: 0.97 }}
          style={{ width: '100%', minHeight: 44, borderRadius: 14, border: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 12, color: '#fff', fontFamily: "'Unbounded', sans-serif", background: shared ? '#22c55e' : '#00024F', transition: 'background 200ms' }}
        >
          <Share2 size={14} />
          <AnimatePresence mode="wait">
            <motion.span key={shared ? 'done' : 'share'}
              initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.12 }}>
              {shared ? 'Link Copied!' : 'Share Match'}
            </motion.span>
          </AnimatePresence>
        </motion.button>
      </div>

      {/* ── Clips ── */}
      <div style={{ padding: '16px 16px 24px', flex: 1 }}>
        <p style={{ fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#010028', margin: '0 0 12px' }}>Recent Clips</p>

        {clips.length === 0 ? (
          <p style={{ color: '#BABABA', fontSize: 11, margin: 0 }}>No clips saved yet.</p>
        ) : (
          <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8, scrollbarWidth: 'none' }}>
            {clips.map((clip) => (
              <motion.div
                key={clip.clip_id}
                whileTap={{ scale: 0.97 }}
                onClick={() => setActiveClipId(clip.clip_id === activeClipId ? null : clip.clip_id)}
                style={{
                  flexShrink: 0, width: 140, borderRadius: 14, overflow: 'hidden', cursor: 'pointer', background: '#fff',
                  border: activeClipId === clip.clip_id ? '1px solid #183DEB' : '0.5px solid #DBDFE2',
                  boxShadow: activeClipId === clip.clip_id ? '0 4px 16px rgba(24,61,235,0.2)' : '0 2px 8px rgba(0,0,0,0.06)',
                }}
              >
                <div style={{ height: 78, background: '#00024F', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                  <Play size={20} color="#183DEB" />
                  <span style={{ position: 'absolute', bottom: 6, right: 6, fontFamily: "'Unbounded', sans-serif", fontSize: 10, background: '#183DEB', color: '#fff', padding: '2px 7px', borderRadius: 99 }}>
                    {clip.duration_s}s
                  </span>
                </div>
                <div style={{ padding: '8px 10px' }}>
                  <p style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 11, color: '#010028', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {clip.camera_id}
                  </p>
                  <p style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 10, color: '#BABABA', margin: '3px 0 0' }}>{formatAgo(clip.created_at)}</p>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* ── Footer ── */}
      <footer style={{ background: '#fff', borderTop: '1px solid rgba(219,223,226,0.8)', padding: '12px 16px', textAlign: 'center' }}>
        <p style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 10, color: '#BABABA', margin: 0 }}>
          LAVARO · {session.venue_name ?? 'Pickleball'}
        </p>
      </footer>
    </div>
  );
}
