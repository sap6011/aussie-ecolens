# Aussie EcoLens — Cloud Setup Guide
## FIT5225 Assignment 2

---

## 📋 Saved Credentials (Share with whole team)

```
=== AWS COGNITO ===
User Pool Name:  AussieEcoLens
User Pool ID:    us-east-1_4xMmuVjWC
Client Name:     aussie-ecolens
Client ID:       5uvau3vaf9vogduhc7rq00mva0
ARN:             arn:aws:cognito-idp:us-east-1:301949382976:userpool/us-east-1_4xMmuVjWC
Token URL:       https://cognito-idp.us-east-1.amazonaws.com/us-east-1_4xMmuVjWC/.well-known/jwks.json

=== S3 BUCKETS ===
Media bucket:    aussie-ecolens-media    (images/videos)
Model bucket:    aussie-ecolens-models   (ML models + opencv layer)
Region:          us-east-1

=== DYNAMODB ===
Table name:      aussie-ecolens-files
Partition key:   fileId (String)
GSI needed:      checksum-index (partition key: checksum)
Region:          us-east-1

=== LAMBDA FUNCTIONS ===
Upload/Dedup:    arn:aws:lambda:us-east-1:301949382976:function:aussie-ecolens-upload
Tagger:          arn:aws:lambda:us-east-1:301949382976:function:aussie-ecolens-tagger
Thumbnail:       arn:aws:lambda:us-east-1:301949382976:function:aussie-ecolens-thumbnail

=== LAMBDA LAYERS ===
OpenCV:          arn:aws:lambda:us-east-1:301949382976:layer:opencv-python-headless:1

=== API GATEWAY ===
API Name:        aussie-ecolens-api
API ID:          1gwype1nc4
Region:          us-east-1
```

---

## ☁️ AWS Setup

### 1. Cognito ✅
1. Go to AWS Console → Cognito → Create user pool
2. Sign-in option → Email
3. Application type → Single-page application (SPA)
4. App name → `aussie-ecolens`
5. Self-registration → Enable
6. Required attributes → `given_name`, `family_name`
7. Return URL → `http://localhost:3000`
8. Click "Create user directory"

---

### 2. S3 Buckets ✅
Create two buckets (all default settings, block all public access):

**Bucket 1 — Media files:**
- Name → `aussie-ecolens-media`
- Region → us-east-1

**Bucket 2 — ML Models:**
- Name → `aussie-ecolens-models`
- Region → us-east-1

**Upload ML models to aussie-ecolens-models:**
- Upload `mdv5a.pt`
- Upload `model.pt`

---

### 3. DynamoDB ✅
1. Go to DynamoDB → Create table
2. Table name → `aussie-ecolens-files`
3. Partition key → `fileId` (String)
4. Settings → Default
5. Click "Create table"

**⚠️ After table is created — add GSI:**
1. Click on table → Indexes tab → Create index
2. Partition key → `checksum` (String)
3. Index name → `checksum-index`
4. Click "Create index"

---

### 4. Lambda Functions ✅

**Create 3 functions (all Python 3.12):**
- `aussie-ecolens-upload`
- `aussie-ecolens-tagger`
- `aussie-ecolens-thumbnail`

**For each function:**
1. Go to IAM → Roles → find the function's role
2. Add permissions:
   - `AmazonS3FullAccess`
   - `AmazonDynamoDBFullAccess_v2`

**Add OpenCV Layer (create once, add to all 3):**
```bash
# In CloudShell:
pip install opencv-python-headless --no-deps -t python/
zip -r opencv-layer.zip python/
aws s3 cp opencv-layer.zip s3://aussie-ecolens-models/opencv-layer.zip
aws lambda publish-layer-version \
  --layer-name opencv-python-headless \
  --content S3Bucket=aussie-ecolens-models,S3Key=opencv-layer.zip \
  --compatible-runtimes python3.12
```

**Add layer to each function:**
- Layers → Edit → Custom layers → `opencv-python-headless` → Version 1

**Add code to each function:**
- `aussie-ecolens-upload` → paste `Deduplication.py`
- `aussie-ecolens-tagger` → paste `Tagging.py`
- `aussie-ecolens-thumbnail` → paste thumbnail code

**Add environment variables to each function:**

`aussie-ecolens-upload`:
```
DYNAMODB_TABLE = aussie-ecolens-files
CHECKSUM_INDEX = checksum-index
TAGGER_FUNCTION = aussie-ecolens-tagger
```

`aussie-ecolens-tagger`:
```
BUCKET_NAME = aussie-ecolens-media
MODEL_BUCKET = aussie-ecolens-models
MEGADETECTOR_KEY = mdv5a.pt
SPECIESNET_KEY = model.pt
DYNAMODB_TABLE = aussie-ecolens-files
THUMBNAIL_FUNCTION = aussie-ecolens-thumbnail
```

**Add S3 trigger (upload Lambda only):**
- Function → `aussie-ecolens-upload`
- Add trigger → S3
- Bucket → `aussie-ecolens-media`
- Event → All object create events
- Check acknowledgement → Add

---

### 5. API Gateway ✅
1. Go to API Gateway → Create API → REST API → Regional
2. API name → `aussie-ecolens-api`

**Create Cognito Authorizer:**
- Authorizers → Create authorizer
- Name → `cognito-authorizer`
- Type → Cognito
- User pool → `AussieEcoLens`
- Token source → `Authorization`

**Create Resources (all with CORS enabled):**
- `/upload` → POST → `aussie-ecolens-upload` → cognito-authorizer
- `/query` → POST → `aussie-ecolens-tagger` → cognito-authorizer
- `/tags` → POST → `aussie-ecolens-tagger` → cognito-authorizer
- `/delete` → POST → `aussie-ecolens-tagger` → cognito-authorizer
- `/notify` → POST → `aussie-ecolens-tagger` → cognito-authorizer

**Deploy API:**
- Click "Deploy API"
- Stage → New stage → name `prod`
- Click "Deploy"
- Save the invoke URL!

---

### 6. SNS Notifications
1. Go to SNS → Create topic
2. Type → Standard
3. Name → `aussie-ecolens-notifications`
4. Create topic
5. Create subscription → Email → enter email address
6. Confirm subscription from email

---

## ☁️ GCP Setup

### 1. Create GCP Project
1. Go to console.cloud.google.com
2. New project → name `aussie-ecolens`
3. Save Project ID

### 2. Cloud Storage (Thumbnails)
1. Go to Cloud Storage → Create bucket
2. Name → `aussie-ecolens-thumbnails`
3. Region → us-central1
4. Access control → Fine-grained
5. Create

**Make bucket public for thumbnail viewing:**
1. Bucket → Permissions → Add principal
2. Principal → `allUsers`
3. Role → Storage Object Viewer
4. Save

### 3. Cloud Functions (Query APIs)
Create 3 Cloud Functions (Python 3.12, HTTP trigger):

**CF 1 — Tag Query:**
- Name → `query-by-tags`
- Trigger → HTTP
- Auth → Allow unauthenticated (Cognito handles auth)
- Code → query by tags with AND logic + minimum counts

**CF 2 — Thumbnail Lookup:**
- Name → `query-by-thumbnail`
- Trigger → HTTP
- Code → find full image URL from thumbnail URL

**CF 3 — File Query:**
- Name → `query-by-file`
- Trigger → HTTP
- Code → upload temp file → detect tags → find matching files → delete temp file

**Environment variables for all CFs:**
```
DYNAMODB_TABLE = aussie-ecolens-files
AWS_REGION = us-east-1
COGNITO_POOL_ID = us-east-1_4xMmuVjWC
COGNITO_CLIENT_ID = 5uvau3vaf9vogduhc7rq00mva0
```

### 4. Cloud Run (Frontend UI)
1. Build React app
2. Create Dockerfile
3. Deploy to Cloud Run:
```bash
gcloud builds submit --tag gcr.io/PROJECT_ID/aussie-ecolens-ui
gcloud run deploy aussie-ecolens-ui \
  --image gcr.io/PROJECT_ID/aussie-ecolens-ui \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated
```
4. Update Cognito callback URL with Cloud Run URL

---

## 🔄 Complete Flow

```
User uploads file
      ↓
S3 aussie-ecolens-media (PUT)
      ↓
Lambda: aussie-ecolens-upload
  → compute checksum
  → check DynamoDB for duplicate
  → if duplicate: delete from S3, return 409
  → if new: invoke aussie-ecolens-tagger
      ↓
Lambda: aussie-ecolens-tagger
  → download file from S3
  → load ML model from aussie-ecolens-models
  → run MegaDetector → crop detections
  → run SpeciesNet → get species tags
  → save tags + URLs to DynamoDB
  → invoke aussie-ecolens-thumbnail
  → check SNS subscriptions → send notifications
      ↓
Lambda: aussie-ecolens-thumbnail
  → download image from S3
  → resize maintaining aspect ratio
  → compress to JPEG
  → upload to GCP Cloud Storage
  → return thumbnail URL

User queries
      ↓
UI → API Gateway → Cognito validates token
      ↓
GCP Cloud Functions → query DynamoDB → return results
      ↓
UI displays thumbnails
```

---

## ⚠️ Things Still To Do

### AWS
- [ ] Add GSI (checksum-index) to DynamoDB
- [ ] Update Deduplication.py to call tagger Lambda
- [ ] Update Tagging.py to call thumbnail Lambda
- [ ] Add environment variables to all Lambda functions
- [ ] Deploy API Gateway (create prod stage)
- [ ] Set up SNS topic + subscriptions
- [ ] Add Lambda invoke permissions to IAM roles

### GCP
- [ ] Create GCP project
- [ ] Create Cloud Storage bucket for thumbnails
- [ ] Create 3 Cloud Functions
- [ ] Deploy frontend to Cloud Run
- [ ] Update Cognito callback URL

### Code
- [ ] Fix Deduplication.py → add Lambda invoke call
- [ ] Fix Tagging.py → add thumbnail Lambda invoke + GCP thumbnail upload
- [ ] Build React frontend UI
- [ ] Write GCP Cloud Functions code

---

## 📝 Notes
- All AWS services in `us-east-1`
- GCP services in `us-central1`
- Cognito token passed in `Authorization` header for all API calls
- GCP Cloud Functions verify Cognito token using JWKS URL
- ML model loaded from S3 on each Lambda cold start (cached in /tmp for warm starts)
