const API_BASE = `http://${window.location.hostname}:8000/api`;
const MEDIA_HOST = window.location.hostname;
const DVR_WINDOW_SECONDS = 60;

const video = document.getElementById("player");
const timeline = document.getElementById("timeline");
const scrubFill = document.getElementById("scrubFill");
const timelineCurrent = document.getElementById("timelineCurrent");
const statusBar = document.getElementById("statusBar");
const liveDot = document.getElementById("liveDot");
const liveText = document.getElementById("liveText");
const courtName = document.getElementById("courtName");
const venueName = document.getElementById("venueName");
const fieldSelect = document.getElementById("field-select");
const camThumbs = document.getElementById("cam-thumbs");

const back5Btn = document.getElementById("back5");
const forward5Btn = document.getElementById("forward5");
const goLiveBtn = document.getElementById("goLive");
const clipBtn = document.getElementById("clipBtn");

// ── URL param: ?court=<fieldId> ───────────────────────────────────────────────

const urlParams = new URLSearchParams(window.location.search);
const courtParam = urlParams.get("court");

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
let venueConfig = null;
let currentFieldCameras = [];

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
    scrubFill.style.width = "100%";
    timelineCurrent.textContent = "LIVE";
    timelineCurrent.classList.add("at-live");
  } else {
    liveDot.classList.remove("live");
    liveText.textContent = "LIVE";
    const behind = Math.round(video.duration - video.currentTime);
    timeline.value = -behind;
    const pct = ((DVR_WINDOW_SECONDS - behind) / DVR_WINDOW_SECONDS) * 100;
    scrubFill.style.width = `${Math.max(0, Math.min(100, pct))}%`;
    timelineCurrent.textContent = `${behind}s behind`;
    timelineCurrent.classList.remove("at-live");
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
  const camName = getCameraName(cameraId);

  const field = venueConfig?.fields?.find(f => f.field_id === currentFieldId);
  courtName.textContent = field?.name || currentFieldId || "VAR Screen";
  venueName.textContent = venueConfig?.venue_name || "";

  statusBar.textContent = `Loading ${camName}...`;

  document.querySelectorAll(".cam-thumb").forEach((el) => {
    el.classList.toggle("active", el.dataset.cam === cameraId);
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
        statusBar.textContent = `● Playing ${camName} · ${countOnlineCameras()} cameras online`;
        goLive();
      } catch {
        statusBar.textContent = `Loaded ${camName}. Press play.`;
      }
    });
    hls.on(Hls.Events.LEVEL_LOADED, () => updateLiveState());
    hls.on(Hls.Events.ERROR, (_, data) => {
      if (data.fatal) {
        statusBar.textContent = "Stream lost. Reconnecting in 3s...";
        reconnectTimer = setTimeout(() => loadCamera(currentCamera), 3000);
      } else {
        statusBar.textContent = `Playback issue: ${data.details || data.type}`;
      }
    });
  } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
    video.src = hlsUrl;
    video.addEventListener("loadedmetadata", async () => {
      try { await video.play(); } catch (_) {}
    }, { once: true });
  } else {
    statusBar.textContent = "This browser does not support HLS playback.";
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

function countOnlineCameras() {
  return currentFieldCameras.filter(c => c.streaming).length;
}

// ── Camera layout (3-column thumbnails) ──────────────────────────────────────

function renderCamLayout(cameras) {
  currentFieldCameras = cameras;
  camThumbs.innerHTML = "";

  for (const cam of cameras) {
    const thumb = document.createElement("div");
    thumb.className = "cam-thumb" +
      (cam.camera_id === currentCamera ? " active" : "") +
      (!cam.streaming ? " offline" : "");
    thumb.dataset.cam = cam.camera_id;

    const statusDot = document.createElement("div");
    statusDot.className = "cam-status-dot" + (cam.streaming ? " online" : "");
    thumb.appendChild(statusDot);

    const label = document.createElement("div");
    label.className = "cam-thumb-label";
    label.textContent = cam.name;
    thumb.appendChild(label);

    if (cam.streaming) {
      thumb.addEventListener("click", () => loadCamera(cam.camera_id));
    }

    camThumbs.appendChild(thumb);
  }
}

// ── Field selector ────────────────────────────────────────────────────────────

function renderFieldSelector(fields) {
  if (courtParam) {
    fieldSelect.style.display = "none";
    return;
  }

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

  sessionId = null;
  await initSession(fieldId);

  const field = venueConfig?.fields?.find(f => f.field_id === fieldId);
  if (!field) return;
  renderCamLayout(field.cameras);

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
    statusBar.textContent = "Could not load config from API. Retrying...";
    setTimeout(init, 4000);
    return;
  }

  await checkPin(venueConfig.pin_required);

  let fields = venueConfig.fields || [];
  if (fields.length === 0) {
    statusBar.textContent = "No fields configured in values.yml.";
    return;
  }

  // Apply ?court= param: lock to single court
  if (courtParam) {
    const locked = fields.find(f => f.field_id === courtParam);
    if (locked) fields = [locked];
  }

  currentFieldId = fields[0].field_id;

  courtName.textContent = fields[0].name || currentFieldId;
  venueName.textContent = venueConfig.venue_name || "";

  renderFieldSelector(venueConfig.fields || []);

  const defaultField = fields[0];
  renderCamLayout(defaultField.cameras);

  await initSession(currentFieldId);

  const firstOnline = defaultField.cameras.find(c => c.streaming) || defaultField.cameras[0];
  if (firstOnline) {
    loadCamera(firstOnline.camera_id);
  } else {
    statusBar.textContent = "No cameras online. Waiting for stream...";
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
  const corner = document.getElementById("qr-corner");
  if (!canvas || typeof QRCode === "undefined") return;
  QRCode.toCanvas(canvas, url, { width: 80, margin: 1 }, (err) => {
    if (!err) {
      corner.classList.add("visible");
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
      statusBar.textContent = `Clip ready: ${data.clip_file}`;
      window.open(data.clip_url, "_blank");
      return;
    } else if (data.status === "error") {
      throw new Error(data.error || "clip generation failed");
    }
    statusBar.textContent = `Creating clip... (${(i + 1) * 2}s)`;
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
  if (!currentCamera) { statusBar.textContent = "No camera selected."; return; }
  statusBar.textContent = `Creating clip from ${getCameraName(currentCamera)}...`;
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
      statusBar.textContent = `Clip ready: ${data.clip_file}`;
      window.open(data.clip_url, "_blank");
    }
  } catch (err) {
    console.error(err);
    statusBar.textContent = `Clip failed: ${err.message}`;
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
