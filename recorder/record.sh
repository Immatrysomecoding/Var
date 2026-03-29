#!/bin/sh
set -eu

VENUE_ID="${VENUE_ID:-playground-hcm-01}"
FIELD_ID="${FIELD_ID:-court-1}"
CAMERAS="court1_camA court1_camB court1_camC court1_camD"

echo "[recorder] waiting for mediamtx..."
sleep 5

record_camera() {
    cam="$1"
    while true; do
        date_dir=$(date +"%Y-%m-%d")
        out_dir="/data/recordings/$VENUE_ID/$FIELD_ID/$cam/$date_dir"
        mkdir -p "$out_dir"
        echo "[recorder] starting $cam -> $out_dir"
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
            "$out_dir/%H-%M-%S.mp4" || true
        echo "[recorder] $cam dropped, retrying in 3s..."
        sleep 3
    done
}

echo "[recorder] starting recording for all cameras..."
for cam in $CAMERAS; do
    record_camera "$cam" &
done

wait
