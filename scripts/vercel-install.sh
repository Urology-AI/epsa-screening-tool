#!/bin/sh
# @epsa/engine resolves to the @urology-ai/epsa-engine GitHub Packages
# registry package (npm: alias in package.json), which needs its own
# registry auth — same EPSA_ENGINE_DEPLOY_KEY secret used previously for git
# clone auth, now used as a registry read token instead.
set -e
echo "@urology-ai:registry=https://npm.pkg.github.com" > .npmrc
echo "//npm.pkg.github.com/:_authToken=${EPSA_ENGINE_DEPLOY_KEY}" >> .npmrc
npm install
rm -f .npmrc
