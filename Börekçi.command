#!/bin/bash
cd /Users/furkanturkkan/borekci || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

if lsof -nP -iTCP:4173 -sTCP:LISTEN >/dev/null 2>&1; then
  open "http://localhost:4173"
  echo ""
  echo "Börekçi zaten açık."
  echo "Tarayıcı: http://localhost:4173"
  echo ""
  echo "Bu pencereyi kapatabilirsin. Program kapanmaz."
  read -r -p "Enter'a basınca pencere kapanır. "
  exit 0
fi

echo "Börekçi açılıyor. Bu pencereyi kapatırsan program da kapanır."
node server.js &
server_pid=$!
sleep 0.6
open "http://localhost:4173"
wait "$server_pid"
