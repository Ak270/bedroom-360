#!/usr/bin/env bash
# Builds the site and publishes dist/ to the gh-pages branch (GitHub Pages).
# Live: https://ak270.github.io/bedroom-360/  and  .../tour/
set -euo pipefail
cd "$(dirname "$0")/.."
npm run build
cd dist
touch .nojekyll
rm -rf .git
git init -q -b gh-pages
git add -A
git commit -qm "Deploy $(date -u +%Y-%m-%dT%H:%MZ)"
git push -qf https://github.com/Ak270/bedroom-360.git gh-pages
rm -rf .git
echo "Deployed. GitHub Pages refreshes in about a minute."
