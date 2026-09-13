#!/bin/bash
set -e
pnpm install --frozen-lockfile
pnpm --filter @workspace/db migrate
pnpm --filter @workspace/db push
