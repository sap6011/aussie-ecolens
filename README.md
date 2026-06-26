# Aussie EcoLens

A multi-cloud serverless wildlife detection platform built on AWS and GCP. Users upload images and videos of Australian wildlife; the platform runs them through an ML pipeline (MegaDetector + SpeciesNet) to detect and classify species, stores results, and supports rich querying and email notifications.

Originally built as a four-person group project for **FIT5225 (Cloud Computing) at Monash University**, S1 2026.

---

## Architecture

**AWS (primary)**
- **Cognito** - user authentication and JWT issuance
- **API Gateway** - REST endpoints, Cognito authoriser
- **Lambda** - Upload, Tagger (containerised, ECR), Thumbnail, Query (FastAPI + Mangum)
- **S3** - media and ML model storage
- **DynamoDB** - file metadata, SHA-256 dedup via GSI
- **SNS** - species-tag email notifications
- **Secrets Manager** - GCP service account key
- **ECR** - tagger container image

**GCP (secondary)**
- **Cloud Run** - React frontend, plus a `query-thumbnail` FastAPI service that independently validates AWS Cognito JWTs (cross-cloud auth)
- **Cloud Storage** - generated thumbnails

**ML pipeline:** S3 upload → Upload Lambda (dedup) → Tagger Lambda (MegaDetector locates animals, SpeciesNet classifies them) → DynamoDB → Thumbnail Lambda → GCS → SNS notifications to subscribers.

---

## Features

- Cognito-backed sign-up and login with token expiry handling
- S3 presigned-URL uploads with client-side SHA-256 deduplication
- Containerised ML tagger running MegaDetector + SpeciesNet on Lambda
- Pillow-based thumbnail generation written to GCP Cloud Storage
- Four query modes: by species, by tag counts (logical AND), by thumbnail URL, and by uploaded sample file (tagged transiently, not stored)
- Per-tag SNS email subscriptions
- Owner-only delete, shared-visibility browse
- React dashboard, query, tag-management, and notifications pages

---

## Tech stack

Python · FastAPI · Mangum · boto3 · python-jose · Pillow · Docker · React · Vite · AWS (Cognito, Lambda, API Gateway, S3, DynamoDB, SNS, ECR, Secrets Manager, IAM) · GCP (Cloud Run, Cloud Storage) · MegaDetector · SpeciesNet

---

## Team and contributions

This was a four-person project. Each member owned a distinct slice end-to-end:

| Member | Ownership |
|---|---|
| **Saptarshi (me)** | AWS Cognito + API Gateway authoriser, all four Lambda execution roles (scoped inline IAM policies), S3 + DynamoDB setup, ECR, cross-cloud JWT validation service on GCP Cloud Run, frontend ↔ backend integration, deployment orchestration |
| **Member 2** | Tagger Lambda (container image, MegaDetector + SpeciesNet), deduplication logic, Thumbnail Lambda, SNS notifications |
| **Member 3** | Query Lambda (species, tag-count, file, thumbnail-URL endpoints), tag management and delete APIs |
| **Member 4** | Full React frontend, styling, GCP Cloud Run deployment of the UI |

The commit history reflects all four contributors.

---

## Things I'm happy with technically

A few pieces that were genuinely hard and that I'd be glad to talk through in an interview:

- **Cross-cloud JWT verification.** The `query-thumbnail` service on GCP Cloud Run fetches Cognito's public JWKS, verifies RS256 tokens with `python-jose`, then queries DynamoDB directly with `boto3` - demonstrating that GCP can independently trust AWS-issued credentials without a shared secret.
- **Tagger Lambda container.** Bundling PyTorch, ONNX, and ultralytics-yolov5 into a Lambda container revealed every sharp edge of Python packaging: ONNX incompatibility with Python 3.12 (fixed by pinning `onnx==1.16.2` with `--only-binary=:all:`), ultralytics transitive conflicts (resolved with `--no-deps`), and cold-start timeouts from eager `torch` imports (moved inside `load_models()`). Took 30+ ECR rebuilds and a lot of CloudWatch log reading.
- **Least-privilege IAM.** Replaced broad managed policies on every Lambda role with scoped inline policies referencing exact resource ARNs, including `dynamodb:Query` on the dedup GSI.

---

## Repository note

This repository was mirrored from the original group repo so all contributors' commits are preserved in the history. Original collaboration happened at [github.com/harshiddd/cloud-eco](https://github.com/harshiddd/cloud-eco).


---

## Replicating this setup

The system spans AWS and GCP. You'll need accounts on both, plus the AWS CLI, `gcloud` CLI, and Docker installed locally.

### Prerequisites

- AWS account with permissions for Cognito, Lambda, S3, DynamoDB, API Gateway, SNS, ECR, Secrets Manager, and IAM
- GCP project with Cloud Run, Cloud Storage, and IAM APIs enabled
- Node.js 18+ and Python 3.11+

### AWS setup

1. **Cognito** — create a User Pool with email sign-in and a public app client (no secret). Note the User Pool ID and App Client ID.
2. **S3** - create a media bucket (with CORS allowing your frontend origin) and a models bucket. Upload the MegaDetector (`mdv5a.pt`) and SpeciesNet (`model.pt`) weights to the models bucket.
3. **DynamoDB** - create a table with `fileId` as the partition key, plus a Global Secondary Index named `checksum-index` on a `checksum` attribute for deduplication.
4. **SNS** - create a topic for species notifications; per-tag subscriptions are created dynamically by the backend.
5. **Lambda** - create four functions in the same region:
   - **Upload** (zip) - issues S3 presigned URLs and checks for duplicates
   - **Tagger** (container, via ECR) - runs MegaDetector and SpeciesNet
   - **Thumbnail** (zip with a custom layer containing `google-cloud-storage` and `pillow`) - uploads thumbnails to GCS
   - **Query** (zip, FastAPI behind Mangum) - handles all query endpoints
   
   Give each Lambda a scoped IAM role granting only the exact resource ARNs it needs.
6. **API Gateway** - create a REST API with a Cognito authoriser pointing at your User Pool, wire it to the Upload and Query Lambdas, and deploy to a `prod` stage.
7. **Secrets Manager** - store your GCP service account JSON key; the Thumbnail Lambda reads it at runtime.
8. **S3 event trigger** - on the media bucket, send `PUT` events to the Upload Lambda. The Upload Lambda invokes the Tagger, which invokes the Thumbnail Lambda.

### GCP setup

1. **Cloud Storage** - create a thumbnails bucket with uniform bucket-level access, and grant `allUsers` the Storage Object Viewer role so thumbnails are publicly readable.
2. **Cloud Run - `query-thumbnail` service** - deploy the FastAPI service from its directory. It validates Cognito JWTs against Cognito's public JWKS and queries DynamoDB directly, so it needs read-only AWS credentials and the User Pool ID as environment variables.
3. **Cloud Run - frontend** - set the Cognito IDs, API Gateway base URL, and the `query-thumbnail` URL in the frontend's environment, build the React app, and deploy.

### Verifying it works

Sign up through the deployed frontend, upload an image of an animal, and within roughly 20–30 seconds the dashboard should show the file with species tags and a thumbnail served from GCS. Subscribing to a species tag on the Notifications page and uploading another matching file should trigger an email via SNS.

### Notes

- Keep all AWS resources in the same region
- The Tagger container image is large (~3 GB), so its first cold start is noticeably slow.
- For teardown, delete the Cloud Run services and GCS bucket first, then unwind the AWS resources in reverse order of creation.
