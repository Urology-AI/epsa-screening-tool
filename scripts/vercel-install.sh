#!/bin/sh
# Vercel rewrites github.com git deps to its own GitHub App SSH key, which
# doesn't have access to the private epsa-engine repo. Route both the ssh
# and https forms through an authenticated clone instead.
set -e
git config --global "url.https://x-access-token:${EPSA_ENGINE_DEPLOY_KEY}@github.com/.insteadOf" "ssh://git@github.com/"
git config --global "url.https://x-access-token:${EPSA_ENGINE_DEPLOY_KEY}@github.com/.insteadOf" "https://github.com/"
npm install
