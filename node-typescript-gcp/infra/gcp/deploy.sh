#!/usr/bin/env bash
# Deploys the Bookshop API to Google Cloud Run.
#
#   PROJECT_ID=my-project ./infra/gcp/deploy.sh
#
# Safe to re-run: every step is idempotent. Run it from the stack folder (node-typescript-gcp/).
set -euo pipefail

: "${PROJECT_ID:?Set PROJECT_ID to your Google Cloud project id}"
REGION="${REGION:-us-central1}"
SERVICE="${SERVICE:-bookshop-api}"
REPO="${REPO:-bookshop}"
SECRET_NAME="${SECRET_NAME:-bookshop-jwt-secret}"
CORS_ORIGINS="${CORS_ORIGINS:-http://localhost:5173}"
# Rate-limit buckets, idempotency keys and the data are held in each instance's memory, so the demo runs a single
# instance. Raise MAX_INSTANCES only after moving that state to shared services (see "Production notes").
MIN_INSTANCES="${MIN_INSTANCES:-0}"
MAX_INSTANCES="${MAX_INSTANCES:-1}"
IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/${SERVICE}:latest"

gcloud config set project "${PROJECT_ID}"

echo "==> Enabling APIs"
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  secretmanager.googleapis.com

echo "==> Artifact Registry repository"
gcloud artifacts repositories describe "${REPO}" --location="${REGION}" >/dev/null 2>&1 ||
  gcloud artifacts repositories create "${REPO}" \
    --repository-format=docker --location="${REGION}" \
    --description="Bookshop API images"

echo "==> JWT signing secret in Secret Manager"
if ! gcloud secrets describe "${SECRET_NAME}" >/dev/null 2>&1; then
  gcloud secrets create "${SECRET_NAME}" --replication-policy=automatic
  openssl rand -base64 48 | tr -d '\n' | gcloud secrets versions add "${SECRET_NAME}" --data-file=-
fi

# Cloud Run runs as the default compute service account unless you pass --service-account.
PROJECT_NUMBER="$(gcloud projects describe "${PROJECT_ID}" --format='value(projectNumber)')"
RUNTIME_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
gcloud secrets add-iam-policy-binding "${SECRET_NAME}" \
  --member="serviceAccount:${RUNTIME_SA}" \
  --role="roles/secretmanager.secretAccessor" >/dev/null

echo "==> Building and pushing the image with Cloud Build"
gcloud builds submit --config infra/gcp/cloudbuild.yaml \
  --substitutions "_REGION=${REGION},_REPO=${REPO},_SERVICE=${SERVICE}" .

echo "==> Deploying to Cloud Run"
# --concurrency: requests one instance handles at once (Node is single threaded; 80 is fine for I/O-bound work).
# --timeout: hard limit per request, above the 10 s maximum a report can simulate.
# --set-secrets: JWT_SECRET is injected from Secret Manager, never baked into the image or the command line.
gcloud run deploy "${SERVICE}" \
  --image="${IMAGE}" \
  --region="${REGION}" \
  --platform=managed \
  --allow-unauthenticated \
  --min-instances="${MIN_INSTANCES}" \
  --max-instances="${MAX_INSTANCES}" \
  --concurrency=80 \
  --timeout=30s \
  --cpu=1 --memory=512Mi \
  --set-secrets="JWT_SECRET=${SECRET_NAME}:latest" \
  --set-env-vars="^@^CORS_ORIGINS=${CORS_ORIGINS}@REQUEST_TIMEOUT_MS=2000"

URL="$(gcloud run services describe "${SERVICE}" --region="${REGION}" --format='value(status.url)')"
echo
echo "Deployed: ${URL}"
echo "Docs:     ${URL}/docs"
echo "Health:   curl ${URL}/health"
