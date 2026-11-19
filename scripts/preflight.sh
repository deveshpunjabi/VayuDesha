#!/usr/bin/env sh
set -eu
printf '%s\n' '=== AirWise v4 local preflight ==='
node --version
npm test
npm run check:size
printf '%s\n' '=== files > 2 MB (should not exist in source repo) ==='
find . -type f -size +2M -not -path './.git/*' -print
if [ -d .git ]; then
  printf '%s\n' '=== local branches ==='
  git branch -a
  printf '%s\n' '=== git object size (not GitHub public verification) ==='
  git count-objects -v
else
  printf '%s\n' 'Git not initialized here; remote branch count/history size NOT VERIFIED.'
fi
printf '%s\n' '=== secrets not tested by a dedicated scanner; inspect .env/history before release ==='
