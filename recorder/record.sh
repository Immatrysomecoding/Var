#!/bin/sh
set -eu

CAMERAS="court1_camA court1_camB court1_camC court1_camD"

for cam in $CAMERAS; do
    mkdir -p "/data/recordings/$cam"
done

echo "[recorder] waiting for mediamtx..."
sleep 5

record_camera() {
    cam="$1"
    while true; do
        echo "[recorder] starting $cam"
        ffmpeg \
            -rtsp_transport tcp \
            -reconnect 1 \
            -reconnect_streamed 1 \
            -reconnect_delay_max 5 \
            -i "rtsp://mediamtx:8554/$cam" \
            -c copy \
            -f segment \
            -segment_time 5 \
            -reset_timestamps 1 \
            -strftime 1 \
            "/data/recordings/$cam/%Y-%m-%d_%H-%M-%S.mp4" || true
        echo "[recorder] $cam dropped, retrying in 3s..."
        sleep 3
    done
}

echo "[recorder] starting recording for all cameras..."
for cam in $CAMERAS; do
    record_camera "$cam" &
done

wait
