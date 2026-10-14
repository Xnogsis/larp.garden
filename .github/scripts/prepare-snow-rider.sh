#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."
snow_commit=6b7c2b9167b592528b221428414e63f06c4640b9
asset_dir="snow-rider-assets/$snow_commit"
if [ -f "$asset_dir/.complete" ]; then
    exit 0
fi
source_dir="${RUNNER_TEMP:-/tmp}/larp-snow-rider-$snow_commit"
if [ ! -d "$source_dir/.git" ]; then
    git init --quiet "$source_dir"
    git -C "$source_dir" remote add origin https://github.com/Vrkids2009/snowrider3d.git
fi
git -C "$source_dir" fetch --quiet --depth 1 origin "$snow_commit"
mkdir -p "$asset_dir"
git -C "$source_dir" archive "$snow_commit" | tar -x -C "$asset_dir"
touch "$asset_dir/.complete"
