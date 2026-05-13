import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera, Play, Plus, Minus, QrCode, HardDrive, ChevronRight, Lock, AlertCircle, Loader } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { BreathingDot } from '../components/BreathingDot';
import { useScoreAnimation } from '../hooks/useScoreAnimation';
import { useClipSave } from '../hooks/useClipSave';
import { useHlsPlayer } from '../hooks/useHlsPlayer';
import {
  getConfig, verifyPin, createSession, saveClip as apiSaveClip,
  getClips, getHealthDetailed, getHlsUrl, getSpectatorUrl,
  type VenueConfig, type FieldConfig, type CameraConfig, type Clip, type HealthDetailed,
} from '../lib/api';

// ── Constants ─────────────────────────────────────────────────────────────────

const CLIP_DURATIONS = [5, 10, 15, 30] as const;
type ClipDuration = (typeof CLIP_DURATIONS)[number];

const shimmerStyle: React.CSSProperties = {
  background: 'linear-gradient(90deg, #183DEB 0%, #2a52ff 40%, #183DEB 80%)',
  backgroundSize: '200% 100%',
  animation: 'shimmer 1.5s linear infinite',
};

// ── Sub-components ────────────────────────────────────────────────────────────

function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <div style={{ width: size, height: size, minWidth: size, background: '#183DEB', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ fontFamily: "'Akira Expanded', sans-serif", fontSize: size * 0.38, color: '#fff', fontWeight: 700, letterSpacing: '0.05em' }}>L</span>
    </div>
  );
}

// ── PIN Overlay ───────────────────────────────────────────────────────────────

function PinOverlay({ onUnlock }: { onUnlock: () => void }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);

  const submit = async () => {
    if (pin.length < 1) return;
    setChecking(true);
    setError('');
    try {
      const ok = await verifyPin(pin);
      if (ok) {
        sessionStorage.setItem('lavaro_pin_ok', '1');
        onUnlock();
      } else {
        setError('Incorrect PIN');
        setPin('');
      }
    } catch {
      setError('Could not verify PIN');
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-5" style={{ background: 'rgba(1,0,40,0.95)', backdropFilter: 'blur(12px)' }}>
      <LogoMark size={48} />
      <h2 style={{ fontFamily: "'Akira Expanded', sans-serif", fontSize: 22, letterSpacing: '0.05em', color: '#fff', margin: 0 }}>PIN REQUIRED</h2>
      <Lock size={20} color="#BABABA" />
      <div className="flex flex-col items-center gap-3">
        <input
          type="password"
          maxLength={8}
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="••••"
          autoFocus
          className="text-center text-2xl tracking-[0.5em] outline-none rounded-xl px-5 py-3 w-48"
          style={{ background: '#00024F', color: '#fff', border: '2px solid #183DEB', fontFamily: "'Unbounded', sans-serif" }}
        />
        {error && <p style={{ color: '#EF4444', fontSize: 13, fontFamily: "'Unbounded', sans-serif" }}>{error}</p>}
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={submit}
          disabled={checking}
          className="px-8 py-3 rounded-xl text-white text-sm font-medium"
          style={{ background: '#183DEB', fontFamily: "'Unbounded', sans-serif', minWidth: 140", opacity: checking ? 0.7 : 1 }}
        >
          {checking ? 'Checking…' : 'Unlock'}
        </motion.button>
      </div>
    </div>
  );
}

// ── Camera Thumbnail ──────────────────────────────────────────────────────────

function CameraThumbnail({ cam, isActive, isOnline, onClick }: {
  cam: CameraConfig; isActive: boolean; isOnline: boolean; onClick: () => void;
}) {
  return (
    <motion.div
      onClick={isOnline ? onClick : undefined}
      whileTap={isOnline ? { scale: 0.97 } : {}}
      style={{
        aspectRatio: '16/9', borderRadius: 12, overflow: 'hidden', position: 'relative',
        cursor: isOnline ? 'pointer' : 'default', opacity: isOnline ? 1 : 0.4,
        background: '#010028',
        border: isActive ? '2px solid #183DEB' : '2px solid rgba(219,223,226,0.1)',
        boxShadow: isActive ? 'inset 0 0 8px rgba(24,61,235,0.4), 0 0 0 1px rgba(24,61,235,0.2)' : 'none',
        transition: 'border-color 200ms, box-shadow 200ms',
      }}
    >
      <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg,#00024F,#010028)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Camera color="rgba(186,186,186,0.3)" size={20} />
      </div>
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '6px 8px', background: 'linear-gradient(to top, #010028CC, transparent)' }}>
        <p style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 10, color: '#BABABA', margin: 0 }}>{cam.name}</p>
      </div>
      <div style={{ position: 'absolute', top: 6, right: 6 }}>
        {isOnline ? <BreathingDot color="#22c55e" size={7} /> : <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#BABABA' }} />}
      </div>
    </motion.div>
  );
}

// ── Score Display ─────────────────────────────────────────────────────────────

function ScoreDisplay({ score, animating }: { score: number; animating: boolean }) {
  return (
    <motion.div
      animate={animating ? { scale: [1, 1.15, 1], filter: ['drop-shadow(0 0 0px rgba(24,61,235,0))', 'drop-shadow(0 0 14px rgba(24,61,235,0.9))', 'drop-shadow(0 0 0px rgba(24,61,235,0))'] } : { scale: 1 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      style={{ fontFamily: "'Akira Expanded', sans-serif", fontSize: 52, fontWeight: 700, letterSpacing: '0.05em', lineHeight: 1, color: '#fff', userSelect: 'none' }}
    >
      {score}
    </motion.div>
  );
}

// ── Timeline Scrubber ─────────────────────────────────────────────────────────

function TimelineScrubber({ offsetSeconds, onSeek, onGoLive }: {
  offsetSeconds: number; onSeek: (s: number) => void; onGoLive: () => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const DVR = 60;
  const progress = Math.max(0, Math.min(100, ((offsetSeconds + DVR) / DVR) * 100));
  const isLive = offsetSeconds >= -2;

  const posToOffset = useCallback((clientX: number): number => {
    if (!trackRef.current) return 0;
    const rect = trackRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return Math.round(ratio * DVR - DVR);
  }, []);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    onSeek(posToOffset(e.clientX));
    const onMove = (me: MouseEvent) => { if (dragging.current) onSeek(posToOffset(me.clientX)); };
    const onUp = () => { dragging.current = false; document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [posToOffset, onSeek]);

  return (
    <div style={{ padding: '0 16px 12px' }}>
      <div ref={trackRef} onClick={(e) => onSeek(posToOffset(e.clientX))} style={{ position: 'relative', height: 3, borderRadius: 2, background: 'rgba(219,223,226,0.25)', cursor: 'pointer' }}>
        <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${progress}%`, background: '#183DEB', borderRadius: 2, pointerEvents: 'none' }} />
        <motion.div
          onMouseDown={onMouseDown}
          whileTap={{ scale: 1.3 }}
          style={{ position: 'absolute', top: '50%', left: `${progress}%`, transform: 'translate(-50%,-50%)', width: 12, height: 12, borderRadius: '50%', background: '#fff', boxShadow: '0 0 4px rgba(0,0,0,0.4)', cursor: 'grab', zIndex: 10 }}
        />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
        <span style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 10, color: 'rgba(219,223,226,0.35)' }}>60s</span>
        <span style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 11, fontWeight: 500, color: isLive ? '#fff' : '#F59E0B' }}>
          {isLive ? 'LIVE' : `${Math.abs(offsetSeconds)}S BEHIND`}
        </span>
        <span style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 10, color: 'rgba(219,223,226,0.35)', opacity: 0 }}>0</span>
      </div>
    </div>
  );
}

// ── Clip Card ─────────────────────────────────────────────────────────────────

function ClipCard({ clip, camName }: { clip: Clip; camName: string }) {
  const [hovered, setHovered] = useState(false);
  const ago = (() => {
    const s = Math.floor((Date.now() - new Date(clip.created_at).getTime()) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    return `${Math.floor(s / 3600)}h ago`;
  })();
  return (
    <motion.div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      whileTap={{ scale: 0.98 }}
      style={{ display: 'flex', gap: 8, padding: 8, borderRadius: 12, cursor: 'pointer', background: '#010028', border: hovered ? '1px solid rgba(24,61,235,0.5)' : '1px solid rgba(219,223,226,0.12)', transition: 'border-color 200ms' }}
    >
      <div style={{ width: 48, height: 36, borderRadius: 8, background: '#00024F', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Play size={13} color="#183DEB" />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 11, color: '#fff', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{camName}</p>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4 }}>
          <span style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 10, background: '#183DEB', color: '#fff', padding: '1px 7px', borderRadius: 99 }}>{clip.duration_s}s</span>
          <span style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 10, color: '#BABABA' }}>{ago}</span>
        </div>
      </div>
      <ChevronRight size={13} color="#BABABA" style={{ alignSelf: 'center', flexShrink: 0 }} />
    </motion.div>
  );
}

// ── Loading / Error states ────────────────────────────────────────────────────

function FullScreenMessage({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle?: string }) {
  return (
    <div style={{ minHeight: '100vh', background: '#010028', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, fontFamily: "'Unbounded', sans-serif" }}>
      {icon}
      <p style={{ color: '#fff', fontSize: 16, fontFamily: "'Akira Expanded', sans-serif", letterSpacing: '0.05em', margin: 0 }}>{title}</p>
      {subtitle && <p style={{ color: '#BABABA', fontSize: 12, margin: 0 }}>{subtitle}</p>}
    </div>
  );
}

// ── Save Clip Button ──────────────────────────────────────────────────────────

function SaveClipButton({ state, onSave }: { state: 'idle' | 'saving' | 'saved'; onSave: () => void }) {
  const label = state === 'saved' ? '✓ CLIP SAVED' : state === 'saving' ? 'SAVING...' : '+ SAVE CLIP';
  const bg = state === 'saved' ? '#22c55e' : '#183DEB';
  return (
    <motion.button
      onClick={state === 'idle' ? onSave : undefined}
      disabled={state !== 'idle'}
      whileTap={state === 'idle' ? { scale: 0.98 } : {}}
      style={{ width: '100%', padding: '12px 0', borderRadius: 12, border: 0, cursor: state === 'idle' ? 'pointer' : 'default', color: '#fff', fontSize: 13, fontFamily: "'Unbounded', sans-serif", minHeight: 44, background: bg, transition: 'background 300ms', ...(state === 'saving' ? shimmerStyle : {}) }}
    >
      <AnimatePresence mode="wait">
        <motion.span key={state} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} transition={{ duration: 0.12 }}>
          {label}
        </motion.span>
      </AnimatePresence>
    </motion.button>
  );
}

// ── Main Courtside Component ──────────────────────────────────────────────────

export default function Courtside() {
  // ─ Config & session state
  const [config, setConfig] = useState<VenueConfig | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [configLoading, setConfigLoading] = useState(true);
  const [pinUnlocked, setPinUnlocked] = useState(() => sessionStorage.getItem('lavaro_pin_ok') === '1');
  const [selectedField, setSelectedField] = useState<FieldConfig | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);

  // ─ Camera state
  const [activeCamera, setActiveCamera] = useState<CameraConfig | null>(null);
  const [cameraOnline, setCameraOnline] = useState<Record<string, boolean>>({});

  // ─ Clips & health
  const [clips, setClips] = useState<Clip[]>([]);
  const [health, setHealth] = useState<HealthDetailed | null>(null);

  // ─ Score (local only — VAR system has no score API)
  const [teamAScore, setTeamAScore] = useState(0);
  const [teamBScore, setTeamBScore] = useState(0);
  const [teamAName, setTeamAName] = useState('TEAM A');
  const [teamBName, setTeamBName] = useState('TEAM B');
  const [editingTeam, setEditingTeam] = useState<'a' | 'b' | null>(null);
  const [teamASet, setTeamASet] = useState(0);
  const [currentGame, setCurrentGame] = useState(1);
  const totalGames = 3;
  const teamAInputRef = useRef<HTMLInputElement>(null);
  const teamBInputRef = useRef<HTMLInputElement>(null);

  // ─ Replay & clip
  const [selectedDuration, setSelectedDuration] = useState<ClipDuration>(10);
  const { animatingA, animatingB, triggerA, triggerB } = useScoreAnimation();

  // ─ HLS player
  const hlsSrc = activeCamera ? getHlsUrl(activeCamera.stream_path) : null;
  const { videoRef, state: hlsState, goLive, seekBy, seekToOffset } = useHlsPlayer(hlsSrc);

  // ─ Load config ─────────────────────────────────────────────────────────────
  useEffect(() => {
    getConfig()
      .then((cfg) => {
        setConfig(cfg);
        const firstField = cfg.fields[0] ?? null;
        setSelectedField(firstField);
      })
      .catch((e) => setConfigError(String(e)))
      .finally(() => setConfigLoading(false));
  }, []);

  // ─ Create session when field is selected ───────────────────────────────────
  useEffect(() => {
    if (!selectedField || !pinUnlocked) return;
    const firstCam = selectedField.cameras[0];
    if (!firstCam) return;
    setActiveCamera(firstCam);
    createSession(selectedField.id, firstCam.stream_path)
      .then((s) => setSessionId(s.session_id))
      .catch(() => {});
  }, [selectedField, pinUnlocked]);

  // ─ Poll camera statuses every 15s ─────────────────────────────────────────
  useEffect(() => {
    if (!selectedField) return;
    const poll = async () => {
      const results = await Promise.all(
        selectedField.cameras.map(async (c) => [c.id, await import('../lib/api').then(m => m.getCameraStatus(c.id))] as const)
      );
      setCameraOnline(Object.fromEntries(results));
    };
    poll();
    const t = setInterval(poll, 15_000);
    return () => clearInterval(t);
  }, [selectedField]);

  // ─ Poll health every 30s ──────────────────────────────────────────────────
  useEffect(() => {
    const poll = () => getHealthDetailed().then(h => { if (h) setHealth(h); });
    poll();
    const t = setInterval(poll, 30_000);
    return () => clearInterval(t);
  }, []);

  // ─ Load clips when session changes ────────────────────────────────────────
  useEffect(() => {
    if (!sessionId) return;
    getClips({ session_id: sessionId }).then(setClips);
    const t = setInterval(() => getClips({ session_id: sessionId }).then(setClips), 15_000);
    return () => clearInterval(t);
  }, [sessionId]);

  // ─ Focus team name inputs ─────────────────────────────────────────────────
  useEffect(() => {
    if (editingTeam === 'a') teamAInputRef.current?.focus();
    if (editingTeam === 'b') teamBInputRef.current?.focus();
  }, [editingTeam]);

  // ─ Clip saving ────────────────────────────────────────────────────────────
  const handleSaved = useCallback(async () => {
    if (!sessionId || !activeCamera) return;
    try {
      await apiSaveClip({
        session_id: sessionId,
        camera_id: activeCamera.id,
        offset_s: hlsState.offsetSeconds,
        duration_s: selectedDuration,
      });
      const fresh = await getClips({ session_id: sessionId });
      setClips(fresh);
    } catch {
      // silently fail — clip save is best-effort
    }
  }, [sessionId, activeCamera, hlsState.offsetSeconds, selectedDuration]);

  const { state: clipState, save: saveClip } = useClipSave(handleSaved);

  // ─ Disk usage from health ─────────────────────────────────────────────────
  const diskPct = health ? Math.max(0, Math.min(100, Math.round((1 - health.disk_free_gb / 500) * 100))) : null;
  const onlineCamCount = selectedField ? selectedField.cameras.filter(c => cameraOnline[c.id]).length : 0;

  // ─ Camera name lookup (for clip cards) ───────────────────────────────────
  const camNameById = useCallback((id: string) => {
    return selectedField?.cameras.find(c => c.id === id)?.name ?? id;
  }, [selectedField]);

  // ─ Guard: loading ─────────────────────────────────────────────────────────
  if (configLoading) {
    return <FullScreenMessage icon={<Loader size={32} color="#183DEB" className="animate-spin" />} title="CONNECTING" subtitle="Reaching VAR system…" />;
  }

  if (configError) {
    return <FullScreenMessage icon={<AlertCircle size={32} color="#EF4444" />} title="CONNECTION FAILED" subtitle={configError} />;
  }

  // ─ Guard: PIN ─────────────────────────────────────────────────────────────
  if (config?.access?.pin_required && !pinUnlocked) {
    return <PinOverlay onUnlock={() => setPinUnlocked(true)} />;
  }

  const spectatorUrl = sessionId ? getSpectatorUrl(sessionId) : null;

  return (
    <div style={{ minHeight: '100vh', background: '#010028', fontFamily: "'Unbounded', sans-serif" }}>
      <style>{`@keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }`}</style>

      <div style={{ display: 'flex', gap: 16, padding: 20, height: '100vh', maxWidth: 1280, margin: '0 auto' }}>

        {/* ══ LEFT PANEL ══ */}
        <div style={{ width: '22%', minWidth: 210, background: '#00024F', borderRadius: 20, padding: 16, display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto', border: '1px solid rgba(219,223,226,0.08)' }}>

          {/* Logo & venue */}
          <div style={{ paddingBottom: 12, borderBottom: '1px solid rgba(219,223,226,0.12)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <LogoMark size={32} />
              <span style={{ color: '#fff', fontWeight: 700, fontSize: 12 }}>LAVARO</span>
            </div>
            <p style={{ color: '#BABABA', fontSize: 11, margin: 0 }}>{config?.venue_name ?? 'Venue'}</p>
            {/* Field selector */}
            {config && config.fields.length > 1 ? (
              <select
                value={selectedField?.id ?? ''}
                onChange={(e) => {
                  const f = config.fields.find(f => f.id === e.target.value) ?? null;
                  setSelectedField(f);
                }}
                style={{ marginTop: 4, background: '#010028', color: '#fff', border: '1px solid rgba(219,223,226,0.2)', borderRadius: 8, padding: '4px 8px', fontSize: 12, width: '100%', fontFamily: "'Unbounded', sans-serif" }}
              >
                {config.fields.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            ) : (
              <p style={{ color: '#fff', fontSize: 13, fontWeight: 500, margin: '2px 0 0' }}>{selectedField?.name ?? '—'}</p>
            )}
          </div>

          {/* Cameras */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <p style={{ color: '#BABABA', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', margin: 0 }}>Cameras</p>
            {(selectedField?.cameras ?? []).map((cam) => (
              <CameraThumbnail
                key={cam.id}
                cam={cam}
                isActive={activeCamera?.id === cam.id}
                isOnline={cameraOnline[cam.id] ?? false}
                onClick={() => setActiveCamera(cam)}
              />
            ))}
            {!selectedField && <p style={{ color: '#BABABA', fontSize: 11 }}>No field selected</p>}
          </div>

          {/* Scoreboard */}
          <div style={{ background: '#010028', borderRadius: 20, padding: 16, marginTop: 'auto', border: '1px solid rgba(219,223,226,0.12)' }}>
            <p style={{ fontFamily: "'Akira Expanded', sans-serif", fontSize: 10, color: '#BABABA', textAlign: 'center', letterSpacing: '0.1em', margin: '0 0 10px' }}>
              GAME {currentGame} OF {totalGames}
            </p>

            {/* Team names */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => setEditingTeam('a')}>
                {editingTeam === 'a' ? (
                  <input ref={teamAInputRef} value={teamAName} onChange={e => setTeamAName(e.target.value.toUpperCase())}
                    onBlur={() => setEditingTeam(null)} onKeyDown={e => e.key === 'Enter' && setEditingTeam(null)}
                    style={{ width: '100%', background: '#00024F', color: '#BABABA', border: '1px solid #183DEB', borderRadius: 6, padding: '3px 6px', fontSize: 10, fontFamily: "'Unbounded', sans-serif", outline: 'none' }} />
                ) : (
                  <p style={{ color: '#BABABA', fontSize: 11, margin: 0 }} title="Click to edit">{teamAName}</p>
                )}
              </div>
              <p style={{ color: '#BABABA', fontSize: 10, margin: 0 }}>VS</p>
              <div style={{ flex: 1, textAlign: 'right', cursor: 'pointer' }} onClick={() => setEditingTeam('b')}>
                {editingTeam === 'b' ? (
                  <input ref={teamBInputRef} value={teamBName} onChange={e => setTeamBName(e.target.value.toUpperCase())}
                    onBlur={() => setEditingTeam(null)} onKeyDown={e => e.key === 'Enter' && setEditingTeam(null)}
                    style={{ width: '100%', background: '#00024F', color: '#BABABA', border: '1px solid #183DEB', borderRadius: 6, padding: '3px 6px', fontSize: 10, fontFamily: "'Unbounded', sans-serif", outline: 'none' }} />
                ) : (
                  <p style={{ color: '#BABABA', fontSize: 11, margin: 0 }} title="Click to edit">{teamBName}</p>
                )}
              </div>
            </div>

            {/* Scores */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}><ScoreDisplay score={teamAScore} animating={animatingA} /></div>
              <div style={{ width: 1, height: 48, background: '#183DEB' }} />
              <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}><ScoreDisplay score={teamBScore} animating={animatingB} /></div>
            </div>

            {/* Score buttons */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6, marginBottom: 10 }}>
              {[
                { label: '−', action: () => setTeamAScore(s => Math.max(0, s - 1)) },
                { label: '+', action: () => { setTeamAScore(s => s + 1); triggerA(); } },
                { label: '−', action: () => setTeamBScore(s => Math.max(0, s - 1)) },
                { label: '+', action: () => { setTeamBScore(s => s + 1); triggerB(); } },
              ].map((btn, i) => (
                <motion.button key={i} whileTap={{ scale: 0.9 }} onClick={btn.action}
                  style={{ height: 36, borderRadius: 999, background: '#183DEB', border: 0, color: '#fff', fontSize: 16, cursor: 'pointer', minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {btn.label}
                </motion.button>
              ))}
            </div>

            {/* Set dots */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 8 }}>
              {Array.from({ length: totalGames }).map((_, i) => (
                <div key={i} style={{ width: 10, height: 10, borderRadius: '50%', background: i < teamASet ? '#183DEB' : 'rgba(219,223,226,0.25)' }} />
              ))}
            </div>

            {/* Reset */}
            <div style={{ display: 'flex', gap: 8, paddingTop: 8, borderTop: '1px solid rgba(219,223,226,0.1)' }}>
              <button onClick={() => { setTeamAScore(0); setTeamBScore(0); }}
                style={{ flex: 1, background: 'none', border: 0, color: '#BABABA', fontSize: 10, cursor: 'pointer', fontFamily: "'Unbounded', sans-serif", padding: 0 }}
                onMouseOver={e => (e.currentTarget.style.color = '#EF4444')}
                onMouseOut={e => (e.currentTarget.style.color = '#BABABA')}>Reset Score</button>
              <button onClick={() => { setTeamAScore(0); setTeamBScore(0); setTeamASet(0); setCurrentGame(1); }}
                style={{ flex: 1, background: 'none', border: 0, color: '#BABABA', fontSize: 10, cursor: 'pointer', fontFamily: "'Unbounded', sans-serif", padding: 0 }}
                onMouseOver={e => (e.currentTarget.style.color = '#EF4444')}
                onMouseOut={e => (e.currentTarget.style.color = '#BABABA')}>Reset Game</button>
            </div>
          </div>
        </div>

        {/* ══ CENTER PANEL ══ */}
        <div style={{ flex: 1, background: '#00024F', borderRadius: 20, overflow: 'hidden', display: 'flex', flexDirection: 'column', border: '1px solid rgba(219,223,226,0.08)' }}>

          {/* Video */}
          <div style={{ flex: 1, position: 'relative', background: '#000', borderRadius: '20px 20px 0 0', overflow: 'hidden' }}>
            {hlsSrc ? (
              <video ref={videoRef} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} playsInline muted />
            ) : (
              <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg,#00024F,#010028)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <Play size={52} color="rgba(24,61,235,0.35)" />
                <p style={{ color: '#BABABA', fontSize: 11, margin: 0 }}>Select a camera to start</p>
              </div>
            )}

            {/* Camera badge */}
            {activeCamera && (
              <div style={{ position: 'absolute', top: 12, left: 12, background: 'rgba(1,0,40,0.75)', backdropFilter: 'blur(8px)', borderRadius: 99, padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 6 }}>
                <BreathingDot color="#EF4444" size={7} />
                <span style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 11, color: '#fff' }}>{activeCamera.name}</span>
              </div>
            )}

            {/* Viewer count badge */}
            <div style={{ position: 'absolute', top: 12, right: 12, background: 'rgba(1,0,40,0.75)', backdropFilter: 'blur(8px)', borderRadius: 99, padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 6 }}>
              <BreathingDot color="#22c55e" size={7} />
              <span style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 11, color: '#fff' }}>Watching</span>
            </div>

            {/* Timeline overlay */}
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, paddingTop: 40, background: 'linear-gradient(to top, rgba(1,0,40,0.9) 0%, transparent 100%)' }}>
              <TimelineScrubber
                offsetSeconds={hlsState.offsetSeconds}
                onSeek={seekToOffset}
                onGoLive={goLive}
              />
            </div>
          </div>

          {/* Replay controls */}
          <div style={{ padding: 16, background: '#010028', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Time jump */}
            <div style={{ display: 'flex', borderRadius: 99, padding: 4, gap: 2, background: '#00024F', border: '1px solid rgba(24,61,235,0.2)' }}>
              {[{ label: '−15s', delta: -15 }, { label: '−5s', delta: -5 }].map(({ label, delta }) => (
                <motion.button key={label} whileTap={{ scale: 0.95 }} onClick={() => seekBy(delta)}
                  style={{ flex: 1, padding: '8px 0', borderRadius: 99, border: 0, background: 'transparent', color: '#fff', fontSize: 12, cursor: 'pointer', fontFamily: "'Unbounded', sans-serif" }}>
                  {label}
                </motion.button>
              ))}
              <motion.button whileTap={{ scale: 0.95 }} onClick={goLive}
                style={{ flex: 1, padding: '8px 0', borderRadius: 99, border: 0, background: hlsState.isLive ? '#183DEB' : 'transparent', color: '#fff', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, fontFamily: "'Unbounded', sans-serif", transition: 'background 200ms' }}>
                {hlsState.isLive && <BreathingDot color="#EF4444" size={7} />}
                LIVE
              </motion.button>
              {[{ label: '+5s', delta: 5 }, { label: '+15s', delta: 15 }].map(({ label, delta }) => (
                <motion.button key={label} whileTap={{ scale: 0.95 }} onClick={() => seekBy(delta)}
                  style={{ flex: 1, padding: '8px 0', borderRadius: 99, border: 0, background: 'transparent', color: '#fff', fontSize: 12, cursor: 'pointer', fontFamily: "'Unbounded', sans-serif" }}>
                  {label}
                </motion.button>
              ))}
            </div>

            {/* Duration selector */}
            <div style={{ display: 'flex', gap: 8 }}>
              {CLIP_DURATIONS.map((d) => (
                <motion.button key={d} whileTap={{ scale: 0.95 }} onClick={() => setSelectedDuration(d)}
                  style={{ flex: 1, padding: '8px 0', borderRadius: 12, border: selectedDuration === d ? '1px solid #183DEB' : '1px solid rgba(219,223,226,0.2)', background: selectedDuration === d ? '#183DEB' : 'transparent', color: selectedDuration === d ? '#fff' : '#BABABA', fontSize: 12, cursor: 'pointer', fontFamily: "'Unbounded', sans-serif", transition: 'all 200ms' }}>
                  {d}s
                </motion.button>
              ))}
            </div>

            {/* Save clip */}
            <SaveClipButton state={clipState} onSave={saveClip} />
          </div>
        </div>

        {/* ══ RIGHT PANEL ══ */}
        <div style={{ width: '22%', minWidth: 210, background: '#00024F', borderRadius: 20, padding: 16, display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto', border: '1px solid rgba(219,223,226,0.08)' }}>

          {/* QR Code */}
          <div style={{ background: '#010028', borderRadius: 16, padding: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, border: '1px solid rgba(219,223,226,0.12)' }}>
            {spectatorUrl ? (
              <div style={{ background: '#fff', borderRadius: 12, padding: 8 }}>
                <QRCodeSVG value={spectatorUrl} size={110} bgColor="#ffffff" fgColor="#010028" level="M" />
              </div>
            ) : (
              <div style={{ width: 126, height: 126, background: '#00024F', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <QrCode size={64} color="rgba(186,186,186,0.3)" />
              </div>
            )}
            <p style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 9, color: '#BABABA', letterSpacing: '0.08em', margin: 0, textAlign: 'center' }}>SCAN TO WATCH</p>
            {spectatorUrl && (
              <p style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 8, color: 'rgba(186,186,186,0.4)', margin: 0, textAlign: 'center', wordBreak: 'break-all' }}>
                {spectatorUrl}
              </p>
            )}
          </div>

          {/* Clip history */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, minHeight: 0 }}>
            <p style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 10, color: '#BABABA', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>Recent Clips</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, overflowY: 'auto' }}>
              <AnimatePresence initial={false}>
                {clips.map((clip) => (
                  <motion.div key={clip.clip_id}
                    initial={{ opacity: 0, y: -8, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.2 }}>
                    <ClipCard clip={clip} camName={camNameById(clip.camera_id)} />
                  </motion.div>
                ))}
              </AnimatePresence>
              {clips.length === 0 && (
                <p style={{ color: '#BABABA', fontSize: 11, textAlign: 'center', padding: '12px 0', opacity: 0.5 }}>No clips yet</p>
              )}
            </div>
          </div>

          {/* System status */}
          <div style={{ background: '#010028', borderRadius: 16, padding: 12, display: 'flex', flexDirection: 'column', gap: 8, border: '1px solid rgba(219,223,226,0.12)' }}>
            <p style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 10, color: '#BABABA', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 2px' }}>System</p>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: health?.mediamtx ? '#22c55e' : '#EF4444', flexShrink: 0 }} />
              <span style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 10, color: '#BABABA' }}>
                {onlineCamCount}/{selectedField?.cameras.length ?? 0} cameras
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <BreathingDot color="#183DEB" size={7} />
              <span style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 10, color: '#BABABA' }}>Recording</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <HardDrive size={10} color="#BABABA" />
              <div style={{ flex: 1, height: 4, borderRadius: 2, background: 'rgba(186,186,186,0.2)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: diskPct !== null ? `${diskPct}%` : '0%', background: diskPct !== null && diskPct > 90 ? '#EF4444' : '#183DEB', borderRadius: 2, transition: 'width 1s' }} />
              </div>
              <span style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 10, color: diskPct !== null && diskPct > 90 ? '#EF4444' : '#BABABA', flexShrink: 0 }}>
                {health ? `${health.disk_free_gb.toFixed(0)}GB free` : '—'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
