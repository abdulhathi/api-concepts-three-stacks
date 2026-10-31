#!/usr/bin/env bash
# Deploys the Bookshop API to Azure App Service.
#   az login            (once)
#   infra/azure/deploy.sh
# Optional: RESOURCE_GROUP, LOCATION, APP_NAME, SKU, CORS_ORIGINS, JWT_SECRET
set -euo pipefail

cd "$(dirname "$0")/../.."

RESOURCE_GROUP="${RESOURCE_GROUP:-rg-api-concepts}"
LOCATION="${LOCATION:-eastus}"
SKU="${SKU:-B1}"
CORS_ORIGINS="${CORS_ORIGINS:-http://localhost:5173}"
# A fresh random key unless you bring one; note that a new key invalidates tokens issued earlier.
JWT_SECRET="${JWT_SECRET:-$(openssl rand -hex 32)}"
BUILD_DIR="$(mktemp -d)"
trap 'rm -rf "$BUILD_DIR"' EXIT

echo "==> Resource group $RESOURCE_GROUP ($LOCATION)"
az group create --name "$RESOURCE_GROUP" --location "$LOCATION" --output none

echo "==> Provisioning infrastructure (Bicep)"
params=(jwtSecret="$JWT_SECRET" corsOrigins="$CORS_ORIGINS" skuName="$SKU")
[[ -n "${APP_NAME:-}" ]] && params+=(appName="$APP_NAME")
az deployment group create \
  --resource-group "$RESOURCE_GROUP" \
  --name api-concepts \
  --template-file infra/azure/main.bicep \
  --parameters "${params[@]}" \
  --output none

app="$(az deployment group show -g "$RESOURCE_GROUP" -n api-concepts --query properties.outputs.webAppName.value -o tsv)"
url="$(az deployment group show -g "$RESOURCE_GROUP" -n api-concepts --query properties.outputs.url.value -o tsv)"

echo "==> Publishing the app"
dotnet publish src/ApiConcepts.Api -c Release -o "$BUILD_DIR/publish" --nologo
(cd "$BUILD_DIR/publish" && zip -qr "$BUILD_DIR/app.zip" .)

echo "==> Zip deploy to $app"
az webapp deploy --resource-group "$RESOURCE_GROUP" --name "$app" --src-path "$BUILD_DIR/app.zip" --type zip

echo "==> Smoke test"
for _ in {1..12}; do
  if curl -fsS "$url/health"; then
    echo
    echo "Deployed: $url  (docs at $url/docs)"
    exit 0
  fi
  sleep 5
done
echo "The app did not answer /health in time; check: az webapp log tail -g $RESOURCE_GROUP -n $app" >&2
exit 1
