#!/usr/bin/env bash
# Prepare a release: bump manifest.json and move CHANGELOG [Unreleased] to a
# new dated section. Does NOT commit, tag, push, or upload — the script prints
# those commands so the human (or agent) can run them deliberately.
#
# Usage: ./scripts/release.sh <X.Y.Z>
set -euo pipefail

VERSION="${1:-}"
if [[ -z "$VERSION" ]]; then
  echo "Usage: $0 <version>" >&2
  echo "Example: $0 1.3.0" >&2
  exit 1
fi

if [[ ! "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "error: version must be X.Y.Z, got '$VERSION'" >&2
  exit 1
fi

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

if [[ -n "$(git status --porcelain)" ]]; then
  echo "error: working tree is not clean — commit or stash first" >&2
  git status --short >&2
  exit 1
fi

TODAY="$(date +%Y-%m-%d)"

python3 - "$VERSION" "$TODAY" <<'PY'
import json, sys, pathlib
version, today = sys.argv[1], sys.argv[2]

manifest = pathlib.Path('manifest.json')
data = json.loads(manifest.read_text())
old = data['version']
if old == version:
    sys.exit(f"error: manifest.json is already at {version}")
data['version'] = version
manifest.write_text(json.dumps(data, indent=2) + '\n')

changelog = pathlib.Path('CHANGELOG.md')
text = changelog.read_text()
if f'[{version}]' in text:
    sys.exit(f"error: CHANGELOG already has a [{version}] section")
if '## [Unreleased]' not in text:
    sys.exit("error: CHANGELOG missing '## [Unreleased]' section")
text = text.replace(
    '## [Unreleased]',
    f"## [Unreleased]\n\n## [{version}] - {today}",
    1,
)
changelog.write_text(text)

print(f"manifest.json: {old} -> {version}")
print(f"CHANGELOG.md:  [Unreleased] -> [{version}] - {today}")
PY

cat <<EOF

Next steps:
  1. Review the diff:
       git diff
  2. Commit and tag:
       git commit -am "chore: release $VERSION"
       git tag v$VERSION
  3. Push:
       git push && git push --tags
  4. Build the Chrome Web Store zip:
       mkdir -p dist
       git archive --format=zip --output=dist/danmaku-$VERSION.zip \\
         v$VERSION manifest.json src assets
  5. Upload dist/danmaku-$VERSION.zip on the Chrome Web Store dashboard
     (Package -> Upload new package).
  6. Paste the [$VERSION] section from CHANGELOG.md into the
     "What's new in this version" field, then submit for review.
  7. Create a GitHub Release for tag v$VERSION with the same notes.
EOF
