const API_BASE = `http://${window.location.hostname}:8000/api`;
const MEDIA_HOST = window.location.hostname;
const DVR_WINDOW_SECONDS = 60;

const video = document.getElementById("player");
const timeline = document.getElementById("timeline");
const timelineCurrent = document.getElementById("timelineCurrent");
const statusEl = document.getElementById("status");
const liveDot = document.getElementById("liveDot");
const liveText = document.getElementById("liveText");
const screenTitle = document.getElementById("screenTitle");
const fieldSelect = document.getElementById("field-select");
const camRow = document.getElementById("cam-row");

const back5Btn = document.getElementById("back5");
const forward5Btn = document.getElementById("forward5");
const goLiveBtn = document.getElementById("goLive");
const clipBtn = document.getElementById("clipBtn");

// ── PIN overlay ───────────────────────────────────────────────────────────────

const pinOverlay = document.getElementById("pin-overlay");
const pinInput = document.getElementById("pin-input");
const pinSubmit = document.getElementById("pin-submit");
const pinError = document.getElementById("pin-error");

async function checkPin(pinRequired) {
  if (!pinRequired) return;
  if (sessionStorage.getItem("pin_ok") === "1") return;

  pinOverlay.classList.add("active");

  await new Promise((resolve) => {
    async function attempt() {
      const pin = pinInput.value.trim();
      if (!pin) { pinError.textContent = "Enter PIN"; return; }
      try {
        const res = await fetch(`${API_BASE}/config/verify-pin`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pin }),
        });
        const data = await res.json();
        if (data.ok) {
          sessionStorage.setItem("pin_ok", "1");
          pinOverlay.classList.remove("active");
          resolve();
        } else {
          pinError.textContent = "Incorrect PIN";
          pinInput.value = "";
          pinInput.focus();
        }
      } catch {
        pinError.textContent = "Could not verify PIN";
      }
    }
    pinSubmit.addEventListener("click", attempt);
    pinInput.addEventListener("keydown", (e) => { if (e.key === "Enter") attempt(); });
  });
}

// ── State ─────────────────────────────────────────────────────────────────────

let hls = null;
let currentCamera = null;
let currentFieldId = null;
let sessionId = null;
let reconnectTimer = null;
let venueConfig = null;  // full /api/config response

// ── HLS utils ─────────────────────────────────────────────────────────────────

function streamUrlForCamera(cameraId) {
  return `http://${MEDIA_HOST}:8888/${cameraId}/index.m3u8`;
}

function isAtLiveEdge() {
  if (!video.duration || !isFinite(video.duration)) return true;
  return video.duration - video.currentTime < 2;
}

function updateLiveState() {
  const atLive = isAtLiveEdge();
  if (atLive) {
    liveDot.classList.add("live");
    liveText.textContent = "LIVE";
    timeline.value = 0;
    timelineCurrent.textContent = "LIVE";
  } else {
    liveDot.classList.remove("live");
    liveText.textContent = "LIVE";
    const behind = Math.round(video.duration - video.currentTime);
    timeline.value = -behind;
    timelineCurrent.textContent = `${behind}s behind`;
  }
}

function seekRelative(seconds) {
  if (!video.duration || !isFinite(video.duration)) return;
  const minTime = Math.max(0, video.duration - DVR_WINDOW_SECONDS);
  const target = Math.max(minTime, Math.min(video.currentTime + seconds, video.duration));
  video.currentTime = target;
  updateLiveState();
}

function goLive() {
  if (!video.duration || !isFinite(video.duration)) return;
  video.currentTime = video.duration;
  updateLiveState();
}

function getClipDuration() {
  const selected = document.querySelector(".dur-btn.active-dur");
  return selected ? parseInt(selected.dataset.dur, 10) : 10;
}

function destroyHls() {
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  if (hls) { hls.destroy(); hls = null; }
}

// ── Camera loading ─────────────────────────────────────────────────────────────

function loadCamera(cameraId) {
  currentCamera = cameraId;
  const fieldName = currentFieldId
    ? (venueConfig?.fields?.find(f => f.field_id === currentFieldId)?.name || currentFieldId)
    : "";
  const camName = getCameraName(cameraId);
  screenTitle.textContent = `${fieldName} — ${camName}`;
  statusEl.textContent = `Loading ${camName}...`;

  document.querySelectorAll(".cam-btn").forEach((btn) => {
    btn.classList.toggle("active-cam", btn.dataset.cam === cameraId);
  });

  destroyHls();

  const hlsUrl = streamUrlForCamera(cameraId);

  if (Hls.isSupported()) {
    hls = new Hls({
      lowLatencyMode: true,
      liveSyncDurationCount: 2,
      liveMaxLatencyDurationCount: 4,
    });
    hls.loadSource(hlsUrl);
    hls.attachMedia(video);
    hls.on(Hls.Events.MANIFEST_PARSED, async () => {
      try {
        await video.play();
        statusEl.textContent = `Playing ${camName}`;
        goLive();
      } catch {
        statusEl.textContent = `Loaded ${camName}. Press play.`;
      }
    });
    hls.on(Hls.Events.LEVEL_LOADED, () => updateLiveState());
    hls.on(Hls.Events.ERROR, (_, data) => {
      if (data.fatal) {
        statusEl.textContent = "Stream lost. Reconnecting in 3s...";
        reconnectTimer = setTimeout(() => loadCamera(currentCamera), 3000);
      } else {
        statusEl.textContent = `Playback issue: ${data.details || data.type}`;
      }
    });
  } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
    video.src = hlsUrl;
    video.addEventListener("loadedmetadata", async () => {
      try { await video.play(); } catch (_) {}
    }, { once: true });
  } else {
    statusEl.textContent = "This browser does not support HLS playback.";
    return;
  }

  logEvent("camera_switch", { camera_id: cameraId });
}

function getCameraName(cameraId) {
  if (!venueConfig) return cameraId;
  for (const field of venueConfig.fields || []) {
    const cam = field.cameras?.find(c => c.camera_id === cameraId);
    if (cam) return cam.name;
  }
  return cameraId;
}

// ── Camera buttons ────────────────────────────────────────────────────────────

function renderCamButtons(cameras) {
  // Remove old buttons (keep the row-label span)
  document.querySelectorAll(".cam-btn").forEach(b => b.remove());

  for (const cam of cameras) {
    const btn = document.createElement("button");
    btn.className = "cam-btn" + (cam.camera_id === currentCamera ? " active-cam" : "");
    if (!cam.streaming) btn.classList.add("offline-cam");
    btn.dataset.cam = cam.camera_id;
    btn.title = cam.streaming ? "Online" : "Offline / not streaming";

    const dot = document.createElement("span");
    dot.className = "cam-dot" + (cam.streaming ? " online" : "");
    btn.appendChild(dot);
    btn.appendChild(document.createTextNode(cam.name));

    if (!cam.streaming) {
      btn.disabled = true;
    } else {
      btn.addEventListener("click", () => loadCamera(cam.camera_id));
    }
    camRow.appendChild(btn);
  }
}

// ── Field selector ────────────────────────────────────────────────────────────

function renderFieldSelector(fields) {
  fieldSelect.innerHTML = "";
  if (fields.length <= 1) {
    fieldSelect.style.display = "none";
    return;
  }
  fieldSelect.style.display = "";
  for (const f of fields) {
    const opt = document.createElement("option");
    opt.value = f.field_id;
    opt.textContent = f.name;
    fieldSelect.appendChild(opt);
  }
  fieldSelect.value = currentFieldId || fields[0].field_id;
}

async function switchField(fieldId) {
  currentFieldId = fieldId;
  currentCamera = null;
  destroyHls();

  // Create new session for this field
  sessionId = null;
  await initSession(fieldId);

  // Load cameras for this field
  const field = venueConfig?.fields?.find(f => f.field_id === fieldId);
  if (!field) return;
  renderCamButtons(field.cameras);

  // Auto-load first online camera
  const firstOnline = field.cameras.find(c => c.streaming) || field.cameras[0];
  if (firstOnline) loadCamera(firstOnline.camera_id);
}

// ── Config bootstrap ──────────────────────────────────────────────────────────

async function loadVenueConfig() {
  const res = await fetch(`${API_BASE}/config`);
  if (!res.ok) throw new Error(`config fetch failed: ${res.status}`);
  return res.json();
}

async function init() {
  try {
    venueConfig = await loadVenueConfig();
  } catch (err) {
    statusEl.textContent = "Could not load config from API. Retrying...";
    setTimeout(init, 4000);
    return;
  }

  // PIN check
  await checkPin(venueConfig.pin_required);

  // Set default field
  const fields = venueConfig.fields || [];
  if (fields.length === 0) {
    statusEl.textContent = "No fields configured in values.yml.";
    return;
  }

  currentFieldId = fields[0].field_id;

  // Render field selector
  renderFieldSelector(fields);

  // Render camera buttons for default field
  const defaultField = fields[0];
  renderCamButtons(defaultField.cameras);

  // Create session
  await initSession(currentFieldId);

  // Load first online camera
  const firstOnline = defaultField.cameras.find(c => c.streaming) || defaultField.cameras[0];
  if (firstOnline) {
    loadCamera(firstOnline.camera_id);
  } else {
    statusEl.textContent = "No cameras online. Waiting for stream...";
  }
}

// ── Session ───────────────────────────────────────────────────────────────────

async function initSession(fieldId) {
  const streamPath = currentCamera || (
    venueConfig?.fields?.find(f => f.field_id === fieldId)?.cameras?.[0]?.camera_id
    || fieldId + "_camA"
  );
  try {
    const res = await fetch(`${API_BASE}/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ field_id: fieldId, stream_path: streamPath }),
    });
    if (res.ok) {
      const data = await res.json();
      sessionId = data.session_id;
      generateQR(`http://${MEDIA_HOST}:8081/f/${sessionId}`);
    }
  } catch (err) {
    console.warn("session init failed", err);
  }
}

function generateQR(url) {
  const canvas = document.getElementById("qr-canvas");
  if (!canvas || typeof QRCode === "undefined") return;
  QRCode.toCanvas(canvas, url, { width: 160, margin: 1 }, (err) => {
    if (!err) {
      document.getElementById("qr-section").style.display = "flex";
      document.getElementById("qr-url").textContent = url;
    }
  });
}

async function logEvent(event, meta = {}) {
  try {
    await fetch(`${API_BASE}/event`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: sessionId || "screen-local",
        event,
        camera_id: currentCamera || null,
        meta,
      }),
    });
  } catch (err) {
    console.warn("event log failed", err);
  }
}

// ── Clip workflow ─────────────────────────────────────────────────────────────

async function pollClipJob(jobId) {
  const maxAttempts = 20;
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const res = await fetch(`${API_BASE}/clip/${jobId}`);
    const data = await res.json();
    if (data.status === "done") {
      statusEl.textContent = `Clip ready: ${data.clip_file}`;
      window.open(data.clip_url, "_blank");
      return;
    } else if (data.status === "error") {
      throw new Error(data.error || "clip generation failed");
    }
    statusEl.textContent = `Creating clip... (${(i + 1) * 2}s)`;
  }
  throw new Error("clip timed out after 40s");
}

// ── Event listeners ───────────────────────────────────────────────────────────

fieldSelect.addEventListener("change", () => switchField(fieldSelect.value));

timeline.addEventListener("input", () => {
  if (!video.duration || !isFinite(video.duration)) return;
  const offset = Number(timeline.value);
  video.currentTime = Math.max(0, video.duration + offset);
  updateLiveState();
});

back5Btn.addEventListener("click", () => {
  seekRelative(-5);
  logEvent("replay_back_5");
});

forward5Btn.addEventListener("click", () => {
  seekRelative(5);
  logEvent("forward_5");
});

goLiveBtn.addEventListener("click", () => {
  goLive();
  logEvent("go_live");
});

document.querySelectorAll(".dur-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".dur-btn").forEach((b) => b.classList.remove("active-dur"));
    btn.classList.add("active-dur");
  });
});

clipBtn.addEventListener("click", async () => {
  if (!currentCamera) { statusEl.textContent = "No camera selected."; return; }
  statusEl.textContent = `Creating clip from ${getCameraName(currentCamera)}...`;
  clipBtn.disabled = true;

  try {
    const res = await fetch(`${API_BASE}/clip`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        field_id: currentFieldId,
        camera_id: currentCamera,
        seconds: getClipDuration(),
        session_id: sessionId || "screen-local",
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail));
    }
    if (data.job_id) {
      await pollClipJob(data.job_id);
    } else {
      statusEl.textContent = `Clip ready: ${data.clip_file}`;
      window.open(data.clip_url, "_blank");
    }
  } catch (err) {
    console.error(err);
    statusEl.textContent = `Clip failed: ${err.message}`;
  } finally {
    clipBtn.disabled = false;
  }
});

video.addEventListener("timeupdate", updateLiveState);
video.addEventListener("seeking", updateLiveState);
video.addEventListener("seeked", updateLiveState);

document.addEventListener("keydown", (e) => {
  if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
  switch (e.key) {
    case " ":
      e.preventDefault();
      video.paused ? video.play() : video.pause();
      break;
    case "ArrowLeft":
      e.preventDefault();
      seekRelative(-5);
      logEvent("replay_back_5", { source: "keyboard" });
      break;
    case "ArrowRight":
      e.preventDefault();
      seekRelative(5);
      logEvent("forward_5", { source: "keyboard" });
      break;
    case "l":
    case "L":
      goLive();
      logEvent("go_live", { source: "keyboard" });
      break;
    case "c":
    case "C":
      if (!clipBtn.disabled) clipBtn.click();
      break;
  }
});

// ── Boot ──────────────────────────────────────────────────────────────────────

init();
