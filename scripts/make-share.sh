#!/usr/bin/env bash
# Builds every social-media version of the 360 tour from public/tour/pano-*.jpg.
# Output: share/ (local files to upload) + public/tour/og.jpg (link preview).
set -euo pipefail
cd "$(dirname "$0")/.."

SPOTS=(doorway bed study wardrobe window dresser)
OUT=share
TMP=.capture/share
rm -rf "$OUT" "$TMP"
mkdir -p "$OUT/facebook-360-photos" "$OUT/instagram-carousel" "$TMP"
FF="ffmpeg -hide_banner -loglevel error -y"

# ---- link preview (1200x630) for WhatsApp / Facebook / LinkedIn / X
$FF -i public/tour/pano-bed.jpg -vf "v360=input=e:output=flat:h_fov=92:v_fov=55:w=1200:h=630:pitch=-6" -q:v 3 public/tour/og.jpg

for s in "${SPOTS[@]}"; do
  # ---- Facebook: native 360 photos (GPano XMP)
  python3 scripts/meta360.py photo "public/tour/pano-$s.jpg" "$OUT/facebook-360-photos/bedroom-360-$s.jpg" >/dev/null
  # ---- Instagram carousel still, 4:5
  $FF -i "public/tour/pano-$s.jpg" -vf "v360=input=e:output=flat:h_fov=78:v_fov=90:w=1080:h=1350:pitch=-8" -q:v 3 "$OUT/instagram-carousel/$s.jpg"
  # ---- a cylindrical strip per spot, used for the panning videos
  $FF -i "public/tour/pano-$s.jpg" -vf "v360=input=e:output=cylindrical:h_fov=230:v_fov=80:w=4800:h=1920:pitch=-6" -q:v 2 "$TMP/strip-$s.jpg"
done

# ---- panning clips: 5 s per spot, crossfaded (vertical 9:16 and landscape 16:9)
pan_video () { # $1 = out, $2 = crop w, $3 = crop h, $4 = out WxH
  local inputs=() filters="" last="" n=${#SPOTS[@]} off=0
  for i in "${!SPOTS[@]}"; do
    inputs+=(-loop 1 -t 5 -framerate 30 -i "$TMP/strip-${SPOTS[$i]}.jpg")
    # Gentle pan through the middle half of the strip (the spot's main view) over 5 s.
    filters+="[$i:v]crop=$2:$3:(iw-$2)*(0.25+0.5*t/5):(ih-$3)/2,scale=$4,setsar=1,format=yuv420p[v$i];"
  done
  last="[v0]"
  for ((i = 1; i < n; i++)); do
    off=$((i * 4))
    filters+="${last}[v$i]xfade=transition=fade:duration=1:offset=$off[x$i];"
    last="[x$i]"
  done
  $FF "${inputs[@]}" -filter_complex "${filters%;}" -map "$last" -c:v libx264 -preset medium -crf 20 -r 30 -movflags +faststart "$1"
}
pan_video "$OUT/instagram-reel-1080x1920.mp4" 1080 1920 1080:1920
pan_video "$OUT/landscape-1920x1080.mp4" 3413 1920 1920:1080

# ---- YouTube / Facebook 360 video: every spot 7 s, crossfaded, spherical metadata
inputs=(); filters=""; last="[v0]"
for i in "${!SPOTS[@]}"; do
  inputs+=(-loop 1 -t 7 -framerate 30 -i "public/tour/pano-${SPOTS[$i]}.jpg")
  filters+="[$i:v]scale=3840:1920,setsar=1,format=yuv420p[v$i];"
done
for ((i = 1; i < ${#SPOTS[@]}; i++)); do
  filters+="${last}[v$i]xfade=transition=fade:duration=1:offset=$((i * 6))[x$i];"
  last="[x$i]"
done
# No +faststart: meta360.py needs moov after mdat to insert the tag safely.
$FF "${inputs[@]}" -filter_complex "${filters%;}" -map "$last" -c:v libx264 -preset medium -crf 22 -r 30 "$TMP/yt.mp4"
python3 scripts/meta360.py video "$TMP/yt.mp4" "$OUT/youtube-360-video.mp4" >/dev/null

du -sh "$OUT"/* public/tour/og.jpg
