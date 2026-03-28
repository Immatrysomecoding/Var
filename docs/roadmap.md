# Roadmap

## Phase 1 — Stabilize ✅ COMPLETE

**Goal:** System works reliably, accessible from phone on local network.

- [x] Fix API volume mounts for recordings and replays
- [x] Fix remote access — `MEDIA_HOST` resolved from `window.location.hostname` in all UIs
- [x] Fix session ID in clip event log
- [x] Multi-camera recorder — parallel ffmpeg for all 4 cameras
- [x] Recorder reconnect — infinite retry with reconnect flags
- [x] DB indexes on `events(session_id)` and `events(ts)`
- [x] Recording cleanup — background thread, 2h TTL, runs every 30 min

---

## Phase 2 — Production Quality ✅ COMPLETE

**Goal:** Smooth streaming, polished UI/UX, reliable under real conditions.

#### Streaming & Latency

- [x] Enable **LL-HLS** — `hlsPartDuration: 200ms` in `mediamtx.yml`
- [x] Tune HLS.js — `lowLatencyMode: true`, `liveSyncDurationCount: 2`, `liveMaxLatencyDurationCount: 4`
- [x] **"Seconds behind live"** — offset from live edge shown in timeline label

#### Screen UI/UX

- [x] **Clip duration selector** — 5s / 10s / 15s / 30s buttons
- [x] **Clip preview** — clip opens in new tab when ready
- [x] **Auto-refresh on stream loss** — fatal HLS error triggers reconnect in 3s
- [x] **QR code** — generated after session init, shows spectator URL
- [x] **Keyboard shortcuts** — Space=play/pause, ←/→=5s seek, L=go live, C=clip

#### Viewer UI/UX

- [x] **Auto-reconnect on stream loss** — fatal HLS error retries every 5s
- [x] **HLS URL built client-side** — viewer resolves host from `window.location.hostname`, not API env var (fixes phones)

#### Reliability

- [x] **Health checks** in `docker-compose.yml` for all 5 services
- [x] **Resource limits** — memory + CPU caps on all containers
- [x] **Async clip generation** — FFmpeg runs in thread pool, returns `job_id`, client polls `/api/clip/{job_id}`
- [x] **Clip job cleanup** — jobs pruned after 10 minutes to prevent memory leak

---

## Phase 3 — Platform

**Goal:** Multi-court, multi-venue, production-deployable.

#### Multi-Court Support

- [ ] Dynamic camera/field config loaded from `values.yml` (or DB)
- [ ] Recorder scales per camera
- [ ] Screen UI loads camera list from API instead of hardcoded HTML
- [ ] Session links to specific court + cameras

#### Access & Auth

- [ ] **PIN-based screen lock** — prevent spectators from touching courtside screen
- [ ] **Viewer-only public URLs** — session links are read-only
- [ ] **Admin panel** — basic management UI for sessions, clips, cameras
- [ ] Optional: simple token auth on API for multi-venue deployments

#### Storage

- [ ] **Configurable storage backends** — local disk (default), NAS, S3
- [ ] **Clip archival** — retain important clips, auto-delete raw segments
- [ ] **Session export** — zip clips + events for a session

#### Deployment

- [ ] **`MEDIA_HOST` auto-detection** — detect LAN IP at startup for zero-config local deployment
- [ ] **One-command setup** — `./setup.sh` that configures `values.yml` and starts the stack
- [ ] **Reverse proxy config** — Nginx or Caddy for HTTPS + single domain
- [ ] **Portability** — test on Raspberry Pi 5 / mini PC (ARM builds)

---

## Phase 4 — AI Integration

**Goal:** Automatic highlights, officiating assistance, training data pipeline.

#### Clip Intelligence

- [ ] **Auto-event detection** — detect rallies, faults, let calls from audio or motion
- [ ] **Auto-clip on event** — trigger clip generation automatically when event detected
- [ ] **Clip tagging UI** — label clips: "fault", "highlight", "disputed", "winner"
- [ ] **Export labeled clips** — structured dataset for ML training

#### AI Officiating (V2)

- [ ] **Ball tracking** — detect ball in/out using computer vision
- [ ] **Line call assist** — overlay "IN" / "OUT" prediction on replay
- [ ] **Confidence score** — show model confidence so referee makes final call
- [ ] **Disputed point review** — flag clip for review, show multiple angles

#### Analytics

- [ ] **Shot heatmaps** — where balls land on court
- [ ] **Player position tracking** — basic skeleton detection
- [ ] **Match stats** — rally length, shot count, fault rate
- [ ] **Event timeline** — visual event log per match

#### Training Data Pipeline

- [ ] SQLite events → labeled video clip dataset
- [ ] Clip storage with metadata (camera angle, court position, player IDs)
- [ ] Export in COCO / custom JSON format for model training
- [ ] Integration hook for external ML inference service
