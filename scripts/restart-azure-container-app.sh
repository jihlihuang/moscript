#!/usr/bin/env bash
set -euo pipefail

if [[ -f ".env.deploy" ]]; then
  set -a
  # shellcheck disable=SC1091
  source ".env.deploy"
  set +a
fi

required_vars=(
  AZURE_RESOURCE_GROUP
  AZURE_CONTAINER_APP_NAME
)

for var_name in "${required_vars[@]}"; do
  if [[ -z "${!var_name:-}" ]]; then
    echo "Missing required environment variable: ${var_name}" >&2
    exit 1
  fi
done

restart_value="$(date +%s)"

echo "Restarting Azure Container App by creating a new revision: ${AZURE_CONTAINER_APP_NAME}"
az containerapp update \
  --name "${AZURE_CONTAINER_APP_NAME}" \
  --resource-group "${AZURE_RESOURCE_GROUP}" \
  --set-env-vars "MOSCRIPT_RESTART_AT=${restart_value}"

echo "Restart requested: MOSCRIPT_RESTART_AT=${restart_value}"
