#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
target="$root/.pio-python"
get_pip="$root/.platformio-get-pip.py"
expected_sha256="fb24e693bab954209a063d90953621412ccad4a500905a726286e038f508ddf6"

if [ -d "$target/platformio" ]; then
  printf 'Repo-local PlatformIO is already installed.\n'
  PYTHONPATH="$target" PLATFORMIO_CORE_DIR="$root/.platformio" python3 -m platformio --version
  exit 0
fi

curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 \
  https://bootstrap.pypa.io/get-pip.py --output "$get_pip"
printf '%s  %s\n' "$expected_sha256" "$get_pip" | sha256sum --check --status
mkdir -p "$target"
python3 "$get_pip" --target "$target"
PYTHONPATH="$target" python3 -m pip install --target "$target" "platformio==6.1.19"
rm -f "$get_pip"
PYTHONPATH="$target" PLATFORMIO_CORE_DIR="$root/.platformio" python3 -m platformio --version
