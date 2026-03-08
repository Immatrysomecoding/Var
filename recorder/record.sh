#!/bin/sh
set -eu

mkdir -p /data/recordings/court1_camA

echo "[recorder] waiting for mediamtx..."
sleep 5

echo "[recorder] recording court1_camA into 5-second segments"

exec ffmpeg \
  -rtsp_transport tcp \
  -i rtsp://mediamtx:8554/court1_camA \
  -c copy \
  -f segment \
  -segment_time 5 \
  -reset_timestamps 1 \
  -strftime 1 \
  /data/recordings/court1_camA/%Y-%m-%d_%H-%M-%S.mp4