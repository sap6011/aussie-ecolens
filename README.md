# Aussie EcoLens

A multi-cloud serverless wildlife detection platform built on AWS and GCP. Users upload images and videos of Australian wildlife; the platform runs them through an ML pipeline (MegaDetector + SpeciesNet) to detect and classify species, stores results, and supports rich querying and email notifications.

Originally built as a four-person group project for **FIT5225 (Cloud Computing) at Monash University**, S1 2026.

---

## Architecture

**AWS (primary)**
- **Cognito** — user authentication and JWT issuance
- **API Gateway** — REST endpoints, Cognito authoriser
- **Lambda** — Upload, Tagger (containerised, ECR), Thumbnail, Query (FastAPI + Mangum)
- **S3** — media and ML model storage
- **DynamoDB** — file metadata, SHA-256 dedup via GSI
- **SNS** — species-tag email notifications
- **Secrets Manager** — GCP service account key
- **ECR** — tagger container image

**GCP (secondary)**
- **Cloud Run** — React frontend, plus a `query-thumbnail` FastAPI service that independently validates AWS Cognito JWTs (cross-cloud auth)
- **Cloud Storage** — generated thumbnails

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
| **Saptarshi (me)** — Solution Architect | AWS Cognito + API Gateway authoriser, all four Lambda execution roles (scoped inline IAM policies), S3 + DynamoDB setup, ECR, cross-cloud JWT validation service on GCP Cloud Run, frontend ↔ backend integration, deployment orchestration |
| **Krithik** | Tagger Lambda (container image, MegaDetector + SpeciesNet), deduplication logic, Thumbnail Lambda, SNS notifications |
| **Harshid** | Query Lambda (species, tag-count, file, thumbnail-URL endpoints), tag management and delete APIs |
| **Neha** | Full React frontend, styling, GCP Cloud Run deployment of the UI |

The commit history reflects all four contributors.

---

## Things I'm happy with technically

A few pieces that were genuinely hard and that I'd be glad to talk through in an interview:

- **Cross-cloud JWT verification.** The `query-thumbnail` service on GCP Cloud Run fetches Cognito's public JWKS, verifies RS256 tokens with `python-jose`, then queries DynamoDB directly with `boto3` — demonstrating that GCP can independently trust AWS-issued credentials without a shared secret.
- **Tagger Lambda container.** Bundling PyTorch, ONNX, and ultralytics-yolov5 into a Lambda container revealed every sharp edge of Python packaging: ONNX incompatibility with Python 3.12 (fixed by pinning `onnx==1.16.2` with `--only-binary=:all:`), ultralytics transitive conflicts (resolved with `--no-deps`), and cold-start timeouts from eager `torch` imports (moved inside `load_models()`). Took 30+ ECR rebuilds and a lot of CloudWatch log reading.
- **Least-privilege IAM.** Replaced broad managed policies on every Lambda role with scoped inline policies referencing exact resource ARNs, including `dynamodb:Query` on the dedup GSI.

---

## Repository note

This repository was mirrored from the original group repo so all contributors' commits are preserved in the history. Original collaboration happened at [github.com/harshiddd/cloud-eco](https://github.com/harshiddd/cloud-eco).
