#!/bin/sh
set -e

if [ -f "/workspace/input.txt" ]; then
  exec node /workspace/solution.js < /workspace/input.txt
else
  exec node /workspace/solution.js
fi
