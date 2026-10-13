#!/usr/bin/env bash
# PostToolUse: formatea con Biome el archivo que Claude acaba de editar.
# Nunca bloquea: si Biome falla o el archivo no aplica, sale con 0.
file=$(jq -r '.tool_input.file_path // empty')
case "$file" in
  *.ts | *.tsx | *.js | *.jsx | *.json | *.css) bunx biome check --write "$file" >/dev/null 2>&1 ;;
esac
exit 0
