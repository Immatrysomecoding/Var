import React from 'react';
import { motion } from 'framer-motion';
import { Monitor, Radio, Zap, Shield } from 'lucide-react';
import { Link } from 'wouter';

function LavaroLogo() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ width: 40, height: 40, background: '#183DEB', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontFamily: "'Akira Expanded', sans-serif", fontSize: 15, letterSpacing: '0.05em', color: '#fff', fontWeight: 700 }}>L</span>
      </div>
      <span style={{ fontFamily: "'Akira Expanded', sans-serif", fontSize: 20, letterSpacing: '0.1em', color: '#fff', fontWeight: 700 }}>LAVARO</span>
    </div>
  );
}

export default function Home() {
  return (
    <div style={{ minHeight: '100vh', background: '#010028', fontFamily: "'Unbounded', sans-serif", display: 'flex', flexDirection: 'column' }}>

      {/* Nav */}
      <nav style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 40px', borderBottom: '1px solid rgba(219,223,226,0.08)' }}>
        <LavaroLogo />
        <span style={{ color: '#BABABA', fontSize: 11 }}>VAR Replay System</span>
      </nav>

      {/* Hero */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '48px 24px', position: 'relative' }}>

        {/* Glow */}
        <div style={{ position: 'absolute', width: 500, height: 500, borderRadius: '50%', background: 'radial-gradient(circle, rgba(24,61,235,0.12) 0%, transparent 70%)', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', pointerEvents: 'none' }} />

        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>

          {/* Status badge */}
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'rgba(24,61,235,0.12)', border: '1px solid rgba(24,61,235,0.3)', borderRadius: 99, padding: '6px 14px', marginBottom: 28 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e' }} />
            <span style={{ color: '#183DEB', fontSize: 11 }}>System Ready</span>
          </div>

          {/* Title */}
          <h1 style={{ fontFamily: "'Akira Expanded', sans-serif", fontSize: 'clamp(28px,5vw,60px)', fontWeight: 700, letterSpacing: '0.05em', color: '#fff', lineHeight: 1.1, margin: '0 0 8px' }}>
            PICKLEBALL
          </h1>
          <h1 style={{ fontFamily: "'Akira Expanded', sans-serif", fontSize: 'clamp(28px,5vw,60px)', fontWeight: 700, letterSpacing: '0.05em', color: '#183DEB', lineHeight: 1.1, margin: '0 0 28px' }}>
            VAR REPLAY
          </h1>

          <p style={{ color: '#BABABA', fontSize: 13, lineHeight: 1.8, maxWidth: 440, margin: '0 0 48px' }}>
            Professional live streaming and instant replay for courtside operators.
            Scan the QR code on-screen to watch as a spectator.
          </p>

          {/* CTA */}
          <Link href="/courtside">
            <motion.a
              whileHover={{ scale: 1.03, background: '#1E47FF' }}
              whileTap={{ scale: 0.97 }}
              style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '18px 32px', borderRadius: 16, background: '#183DEB', cursor: 'pointer', textDecoration: 'none', minWidth: 280, transition: 'background 200ms' }}
            >
              <div style={{ width: 42, height: 42, borderRadius: 10, background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Monitor size={22} color="#fff" />
              </div>
              <div style={{ flex: 1, textAlign: 'left' }}>
                <p style={{ color: '#fff', fontSize: 14, fontWeight: 600, margin: 0 }}>Enter Courtside</p>
                <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, margin: '3px 0 0' }}>Operator interface · Full control</p>
              </div>
              <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 20 }}>→</span>
            </motion.a>
          </Link>
        </motion.div>
      </div>

      {/* Feature strip */}
      <div style={{ padding: '0 40px 40px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, background: '#00024F', borderRadius: 20, padding: 24, border: '1px solid rgba(219,223,226,0.08)' }}>
          {[
            { icon: <Radio size={15} color="#183DEB" />, title: 'LL-HLS Streaming', desc: 'Sub-3s live latency' },
            { icon: <Zap size={15} color="#183DEB" />, title: 'Instant Replay', desc: '60s DVR window' },
            { icon: <Shield size={15} color="#183DEB" />, title: 'PIN Protected', desc: 'Operator access control' },
          ].map((f) => (
            <div key={f.title} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(24,61,235,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {f.icon}
              </div>
              <div>
                <p style={{ color: '#fff', fontSize: 12, fontWeight: 500, margin: 0 }}>{f.title}</p>
                <p style={{ color: '#BABABA', fontSize: 11, margin: '2px 0 0' }}>{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
