#!/usr/bin/env sh
# Lanceur macOS / Linux — voir run.py pour les options (--fabric, --dev, --test…)
cd "$(dirname "$0")" && exec python3 run.py "$@"
