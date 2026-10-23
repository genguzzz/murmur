#!/bin/sh
# Cut a release: bump app/package.json, commit, tag vX.Y.Z (annotated, message = notes), push.
# The tag push makes CI build the IPA, attach it to a GitHub Release and publish it
# to the software source under that version.
#   ./scripts/release.sh 0.3.0 "新增：xxx；修复：yyy"
set -e
cd "$(dirname "$0")/.."

VERSION="$1"
NOTES="${2:-Murmur $1}"
echo "$VERSION" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$' || { echo "usage: $0 X.Y.Z [notes]" >&2; exit 1; }
[ -z "$(git status --porcelain)" ] || { echo "working tree not clean; commit first" >&2; exit 1; }
git rev-parse "v$VERSION" >/dev/null 2>&1 && { echo "tag v$VERSION already exists" >&2; exit 1; }

CURRENT=$(node -p "require('./app/package.json').version")
LOWER=$(printf '%s\n%s\n' "$CURRENT" "$VERSION" | sort -V | head -1)
if [ "$CURRENT" != "$VERSION" ] && [ "$LOWER" = "$VERSION" ]; then
  echo "version $VERSION is lower than current $CURRENT" >&2; exit 1
fi

if [ "$CURRENT" != "$VERSION" ]; then
  (cd app && npm version "$VERSION" --no-git-tag-version >/dev/null)
  git add app/package.json app/package-lock.json
  git commit -q -m "Release v$VERSION"
fi
git tag -a "v$VERSION" -m "$NOTES"
git push origin HEAD "v$VERSION"
echo "pushed v$VERSION — CI: https://github.com/$(git remote get-url origin | sed -E 's#.*github.com[:/]##; s#\.git$##')/actions"
