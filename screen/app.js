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

const back5Btn = document.getElementById("back5");
const forward5Btn = document.getElementById("forward5");
const goLiveBtn = document.getElementById("goLive");
const clipBtn = document.getElementById("clipBtn");
const camButtons = Array.from(document.querySelectorAll(".cam-btn"));

let hls = null;
let currentCamera = "court1_camA";
let sessionId = null;
let reconnectTimer = null;

function streamUrlForCamera(cameraId) {
  return `http://${MEDIA_HOST}:8888/${cameraId}/index.m3u8`;
}

async function initSession() {
  try {
    const res = await fetch(`${API_BASE}/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ field_id: "court1", stream_path: currentCamera }),
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
        meta,
      }),
    });
  } catch (err) {
    console.warn("event log failed", err);
  }
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
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (hls) {
    hls.destroy();
    hls = null;
  }
}

function loadCamera(cameraId) {
  currentCamera = cameraId;
  screenTitle.textContent = `Court Screen — ${cameraId}`;
  statusEl.textContent = `Loading ${cameraId}...`;

  camButtons.forEach((btn) => {
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
        statusEl.textContent = `Playing ${cameraId}`;
        goLive();
      } catch (err) {
        statusEl.textContent = `Loaded ${cameraId}. Press play if needed.`;
      }
    });

    hls.on(Hls.Events.LEVEL_LOADED, () => {
      updateLiveState();
    });

    hls.on(Hls.Events.ERROR, (_, data) => {
      console.error("HLS error", data);
      if (data.fatal) {
        statusEl.textContent = "Stream lost. Reconnecting in 3s...";
        reconnectTimer = setTimeout(() => loadCamera(currentCamera), 3000);
      } else {
        statusEl.textContent = `Playback issue: ${data.details || data.type}`;
      }
    });
  } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
    video.src = hlsUrl;
    video.addEventListener(
      "loadedmetadata",
      async () => {
        try { await video.play(); } catch (_) {}
      },
      { once: true },
    );
  } else {
    statusEl.textContent = "This browser does not support HLS playback.";
  }

  logEvent("camera_switch", { camera_id: cameraId });
}

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

timeline.addEventListener("input", () => {
  if (!video.duration || !isFinite(video.duration)) return;
  const offset = Number(timeline.value); // -60 to 0
  video.currentTime = Math.max(0, video.duration + offset);
  updateLiveState();
});

back5Btn.addEventListener("click", () => {
  seekRelative(-5);
  logEvent("replay_back_5", { camera_id: currentCamera });
});

forward5Btn.addEventListener("click", () => {
  seekRelative(5);
  logEvent("forward_5", { camera_id: currentCamera });
});

goLiveBtn.addEventListener("click", () => {
  goLive();
  logEvent("go_live", { camera_id: currentCamera });
});

document.querySelectorAll(".dur-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".dur-btn").forEach((b) => b.classList.remove("active-dur"));
    btn.classList.add("active-dur");
  });
});

clipBtn.addEventListener("click", async () => {
  statusEl.textContent = `Creating clip from ${currentCamera}...`;
  clipBtn.disabled = true;

  try {
    const res = await fetch(`${API_BASE}/clip`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        field_id: "court1",
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

camButtons.forEach((btn) => {
  btn.addEventListener("click", () => loadCamera(btn.dataset.cam));
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
      logEvent("replay_back_5", { camera_id: currentCamera, source: "keyboard" });
      break;
    case "ArrowRight":
      e.preventDefault();
      seekRelative(5);
      logEvent("forward_5", { camera_id: currentCamera, source: "keyboard" });
      break;
    case "l":
    case "L":
      goLive();
      logEvent("go_live", { camera_id: currentCamera, source: "keyboard" });
      break;
    case "c":
    case "C":
      if (!clipBtn.disabled) clipBtn.click();
      break;
  }
});

initSession().then(() => loadCamera(currentCamera));
