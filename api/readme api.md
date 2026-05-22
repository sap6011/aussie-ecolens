# Aussie EcoLens — Query API (Member 3)

This folder contains the REST API for all query, tag, and delete operations.
Built with **FastAPI** + **AWS DynamoDB** (`ap-southeast-2`).

---

## Prerequisites

Make sure you have these installed before starting:

- Python 3.12+
- pip
- AWS CLI (`brew install awscli` on Mac)
- Access to the shared AWS account credentials (ask Member 1)

---

## Setup (do this once)

### 1. Clone the repo and navigate to the api folder

```bash
git clone https://github.com/YOUR_TEAM/cloud-eco.git
cd cloud-eco/api
```

### 2. Create and activate a virtual environment

```bash
# Mac/Linux
python3 -m venv venv
source venv/bin/activate

# Windows
python -m venv venv
venv\Scripts\activate
```

### 3. Install dependencies

```bash
pip install -r requirements.txt
```

### 4. Configure AWS credentials

Get the access key and secret from Member 1 (or use your own IAM user on the shared account).

```bash
aws configure
```

Enter the following when prompted:
```
AWS Access Key ID:     <ask Member 1>
AWS Secret Access Key: <ask Member 1>
Default region name:   ap-southeast-2
Default output format: json
```

### 5. Create a .env file

Create a file called `.env` inside the `api/` folder:

```bash
AWS_REGION=ap-southeast-2
DYNAMODB_TABLE=media_files
API_BASE_URL=http://localhost:8000
```

> ⚠️ Never commit `.env` to GitHub. It is already in `.gitignore`.

### 6. Create the DynamoDB table (only needs to be done once per account)

```bash
python3 setup_dynamo.py
```

Expected output:
```
✅ Table created: media_files
```

> If you see "Table already exists" that's fine — skip this step.

### 7. Seed the table with test data

```bash
python3 seed.py
```

Expected output:
```
Seeded: abc001
Seeded: abc002
Seeded: abc003
✅ Done — seeded 3 documents
```

---

## Running the API locally

```bash
uvicorn main:app --reload
```

The API runs at `http://localhost:8000`

Interactive docs (Swagger UI) available at `http://localhost:8000/docs`
— you can test every endpoint directly in the browser from here.

---

## API Endpoints

All endpoints accept and return JSON.

### POST `/query/tags`
Find files where ALL specified tags meet minimum counts (AND logic).

**Request:**
```json
{
  "tags": {
    "Macropus_giganteus": 2,
    "Vulpes_vulpes": 1
  }
}
```

**Response:**
```json
{
  "results": [
    {
      "thumbnail_url": "https://s3.amazonaws.com/...",
      "original_url": "https://s3.amazonaws.com/...",
      "file_type": "image"
    }
  ]
}
```

---

### POST `/query/species`
Find all files containing at least one of the requested species.

**Request:**
```json
{
  "species": ["Macropus_giganteus"]
}
```

**Response:**
```json
{
  "results": [
    {
      "original_url": "...",
      "thumbnail_url": "...",
      "file_type": "image",
      "tags": { "Macropus_giganteus": 3 }
    }
  ]
}
```

---

### POST `/query/thumbnail`
Get the full-size image URL from a thumbnail URL.

**Request:**
```json
{
  "thumbnail_url": "https://s3.amazonaws.com/bucket/thumbnails/abc001.jpg"
}
```

**Response:**
```json
{
  "original_url": "https://s3.amazonaws.com/bucket/images/abc001.jpg"
}
```

---

### POST `/tags`
Manually add or remove tags from one or more files.

- `operation: 1` = add tag
- `operation: 0` = remove tag

**Request:**
```json
{
  "urls": [
    "https://s3.amazonaws.com/bucket/images/abc001.jpg"
  ],
  "tags": ["Felis_catus"],
  "operation": 1
}
```

**Response:**
```json
{
  "updated": 1
}
```

---

### DELETE `/files`
Remove files and their database records.

> ⚠️ This deletes the DynamoDB record only. S3 file deletion is handled by Member 2's Lambda.

**Request:**
```json
{
  "urls": [
    "https://s3.amazonaws.com/bucket/videos/abc003.mp4"
  ]
}
```

**Response:**
```json
{
  "deleted": 1
}
```

---

## DynamoDB Document Schema

Every file in the `media_files` table follows this structure:

```json
{
  "file_id":       "abc001",
  "original_url":  "https://s3.amazonaws.com/bucket/images/abc001.jpg",
  "thumbnail_url": "https://s3.amazonaws.com/bucket/thumbnails/abc001.jpg",
  "file_type":     "image",
  "checksum":      "d41d8cd98f00b204e9800998ecf8427e",
  "tags": {
    "Macropus_giganteus": 3,
    "Vulpes_vulpes": 1
  },
  "uploaded_by":   "user@email.com"
}
```

> **Member 2 (Lambda/tagging):** When your function detects species in a file, write a document in this exact format to DynamoDB. Use `file_id = checksum` to support deduplication.

---

## Running Tests

Make sure uvicorn is running first, then in a second terminal:

```bash
source venv/bin/activate
python3 test_api.py
```

Expected output:
```
============================================================
  Aussie EcoLens API Test Suite
============================================================

✅ PASS Find files with Macropus_giganteus >= 2 (expect abc001 + abc002)
✅ PASS Find files with kangaroo>=3 AND fox>=1 (expect only abc001)
...
============================================================
  Results: 14/14 passed
  🎉 All tests passed — API is ready for integration!
============================================================
```

> After running tests, restore the seed data with `python3 seed.py`
> (Test 13 deletes abc003 as part of the delete endpoint test.)

---

## Project Structure

```
api/
├── main.py            ← FastAPI app — all 5 endpoints
├── setup_dynamo.py    ← Run once to create DynamoDB table
├── seed.py            ← Populate table with test data
├── test_api.py        ← Automated test suite (14 tests)
├── requirements.txt   ← Python dependencies
├── .env               ← Local config (NOT committed to git)
└── venv/              ← Virtual environment (NOT committed to git)
```

---

## Common Errors

| Error | Fix |
|---|---|
| `NoCredentialsError` | Run `aws configure` with the correct keys |
| `ResourceNotFoundException` | Run `python3 setup_dynamo.py` to create the table |
| `Table already exists` | Table is already set up — skip `setup_dynamo.py` |
| `uvicorn: command not found` | Activate venv first: `source venv/bin/activate` |
| Port 8000 already in use | Run `uvicorn main:app --reload --port 8001` |
| `deleted: 0` on DELETE | Check the URL matches exactly — including `/images/` vs `/videos/` and file extension |

---

## Integration Notes for Other Members

**Member 1 (Auth):**
Once Cognito is set up, share the `COGNITO_USER_POOL_ID` and `COGNITO_CLIENT_ID`.
These will be added to `main.py` to protect all endpoints with JWT verification.

**Member 2 (Lambda/ML):**
Your Lambda should write to DynamoDB using the schema above.
Table name: `media_files`, Region: `ap-southeast-2`.
Use `file_id = MD5_checksum_of_file` for deduplication support.

**Member 4 (UI):**
All endpoints are documented at `http://localhost:8000/docs`.
Base URL for local dev: `http://localhost:8000`
Base URL after deployment: TBD — Member 3 will update this once Lambda is deployed.

---

## Environment Variables Reference

| Variable | Value | Description |
|---|---|---|
| `AWS_REGION` | `ap-southeast-2` | AWS region for DynamoDB |
| `DYNAMODB_TABLE` | `media_files` | DynamoDB table name |
| `API_BASE_URL` | `http://localhost:8000` | Base URL (update after deployment) |