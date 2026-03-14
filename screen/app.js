//Consider implement dvr window for better fine-tuned user experience
//Consider second behind live
//Consider live edge and fine-tune hls
//Consider do it after the v0.1 of testing phrase
const API_BASE = "http://localhost:8000/api";
const MEDIA_HOST = "localhost";
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

function streamUrlForCamera(cameraId) {
  return `http://${MEDIA_HOST}:8888/${cameraId}/index.m3u8`;
}

async function logEvent(event, meta = {}) {
  try {
    await fetch(`${API_BASE}/event`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        session_id: "screen-local",
        event,
        meta,
      }),
    });
  } catch (err) {
    console.warn("event log failed", err);
  }
}

function isAtLiveEdge() {
  if (!video.duration || !isFinite(video.duration)) {
    return true;
  }
  const diff = video.duration - video.currentTime;
  return diff < 2;
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
    const behind = Math.round(video.currentTime - video.duration);
    timeline.value = behind;
    timelineCurrent.textContent = `${behind}s`;
  }
}

function seekRelative(seconds) {
  if (!video.duration || !isFinite(video.duration)) {
    return;
  }

  let target = video.currentTime + seconds;
  const minTime = Math.max(0, video.duration - DVR_WINDOW_SECONDS);
  const maxTime = video.duration;

  if (target < minTime) target = minTime;
  if (target > maxTime) target = maxTime;

  video.currentTime = target;
  updateLiveState();
}

function goLive() {
  if (!video.duration || !isFinite(video.duration)) {
    return;
  }

  video.currentTime = video.duration;
  updateLiveState();
}

function destroyHls() {
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
      lowLatencyMode: false,
      liveSyncDurationCount: 3,
      liveMaxLatencyDurationCount: 10,
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
      statusEl.textContent = `Playback error: ${data.details || data.type}`;
    });
  } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
    video.src = hlsUrl;
    video.addEventListener(
      "loadedmetadata",
      async () => {
        try {
          await video.play();
        } catch (_) {}
      },
      { once: true },
    );
  } else {
    statusEl.textContent = "This browser does not support HLS playback.";
  }

  logEvent("camera_switch", { camera_id: cameraId });
}

timeline.addEventListener("input", () => {
  if (!video.duration || !isFinite(video.duration)) {
    return;
  }

  const offset = Number(timeline.value); // -60 to 0
  const target = Math.max(0, video.duration + offset);
  video.currentTime = target;
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

clipBtn.addEventListener("click", async () => {
  statusEl.textContent = `Creating clip from ${currentCamera}...`;

  try {
    const res = await fetch(`${API_BASE}/clip`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        field_id: "court1",
        camera_id: currentCamera,
        seconds: 10,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(
        typeof data.detail === "string"
          ? data.detail
          : JSON.stringify(data.detail),
      );
    }

    statusEl.textContent = `Clip created: ${data.clip_file}`;
    window.open(data.clip_url, "_blank");
  } catch (err) {
    console.error(err);
    statusEl.textContent = `Clip failed: ${err.message}`;
  }
});

camButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    loadCamera(btn.dataset.cam);
  });
});

video.addEventListener("timeupdate", updateLiveState);
video.addEventListener("seeking", updateLiveState);
video.addEventListener("seeked", updateLiveState);

loadCamera(currentCamera);
