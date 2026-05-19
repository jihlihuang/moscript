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
  AZURE_ACR_NAME
)

for var_name in "${required_vars[@]}"; do
  if [[ -z "${!var_name:-}" ]]; then
    echo "Missing required environment variable: ${var_name}" >&2
    exit 1
  fi
done

image_repository="${AZURE_IMAGE_REPOSITORY:-moscript}"
image_tag="${AZURE_IMAGE_TAG:-$(date +%Y%m%d%H%M%S)}"
image_name="${AZURE_ACR_NAME}.azurecr.io/${image_repository}:${image_tag}"
platform="${DOCKER_PLATFORM:-linux/amd64}"
build_mode="${AZURE_BUILD_MODE:-acr}"

if [[ "${build_mode}" == "acr" ]]; then
  echo "Building in Azure Container Registry: ${AZURE_ACR_NAME}"
  az acr build \
    --registry "${AZURE_ACR_NAME}" \
    --image "${image_repository}:${image_tag}" \
    --platform "${platform}" \
    .
elif [[ "${build_mode}" == "local" ]]; then
  echo "Logging in to Azure Container Registry: ${AZURE_ACR_NAME}"
  az acr login --name "${AZURE_ACR_NAME}"

  echo "Building and pushing ${image_name} for ${platform}"
  docker buildx build \
    --platform "${platform}" \
    --tag "${image_name}" \
    --push \
    .
else
  echo "Invalid AZURE_BUILD_MODE: ${build_mode}. Use 'acr' or 'local'." >&2
  exit 1
fi

echo "Updating Azure Container App: ${AZURE_CONTAINER_APP_NAME}"
az containerapp update \
  --name "${AZURE_CONTAINER_APP_NAME}" \
  --resource-group "${AZURE_RESOURCE_GROUP}" \
  --image "${image_name}"

echo "Deployment updated: ${image_name}"
