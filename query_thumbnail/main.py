import json
import logging
import os
import urllib.request
 
import boto3
from boto3.dynamodb.conditions import Attr
from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from jose import JWTError, jwt
from pydantic import BaseModel
 
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
 
app = FastAPI(title="EcoLens Thumbnail Query")
 
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["POST", "GET", "OPTIONS"],
    allow_headers=["*"],
)
 
# AWS Cognito config
AWS_REGION    = os.environ.get("AWS_REGION", "us-east-1")
USER_POOL_ID  = os.environ.get("COGNITO_USER_POOL_ID", "us-east-1_4xMmuVjWC")
JWKS_URL      = f"https://cognito-idp.{AWS_REGION}.amazonaws.com/{USER_POOL_ID}/.well-known/jwks.json"
DYNAMODB_TABLE = os.environ.get("DYNAMODB_TABLE", "aussie-ecolens-files")
 
# Cache JWKS keys so we don't fetch on every request
_jwks_cache = None
 
def get_jwks():
    global _jwks_cache
    if _jwks_cache is None:
        logger.info("Fetching JWKS from Cognito: %s", JWKS_URL)
        with urllib.request.urlopen(JWKS_URL) as r:
            _jwks_cache = json.loads(r.read())
    return _jwks_cache
 
 
def validate_cognito_token(authorization: str) -> dict:
    """
    Validates an AWS Cognito JWT token.
    This is the cross-cloud auth piece — GCP service trusting AWS Cognito.
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")
 
    token = authorization[7:]  # strip "Bearer "
 
    try:
        # Get the key ID from the token header
        header = jwt.get_unverified_header(token)
        kid = header.get("kid")
 
        # Find the matching public key from Cognito's JWKS
        jwks = get_jwks()
        public_key = next((k for k in jwks["keys"] if k["kid"] == kid), None)
 
        if not public_key:
            raise HTTPException(status_code=401, detail="Token signing key not found")
 
        # Verify and decode the token
        claims = jwt.decode(
            token,
            public_key,
            algorithms=["RS256"],
            options={"verify_aud": False}  # Cognito ID tokens don't always have aud
        )
        logger.info("Token valid for user: %s", claims.get("email") or claims.get("sub"))
        return claims
 
    except JWTError as e:
        logger.warning("Token validation failed: %s", e)
        raise HTTPException(status_code=401, detail=f"Invalid token: {str(e)}")
 
 
def get_dynamodb_table():
    """
    Creates a DynamoDB client using AWS credentials from environment variables.
    These are set as Cloud Run secrets/env vars — GCP calling AWS cross-cloud.
    """
    dynamodb = boto3.resource(
        "dynamodb",
        region_name=AWS_REGION,
        aws_access_key_id=os.environ.get("AWS_ACCESS_KEY_ID"),
        aws_secret_access_key=os.environ.get("AWS_SECRET_ACCESS_KEY"),
        aws_session_token=os.environ.get("AWS_SESSION_TOKEN"),  # needed for AWS Academy
    )
    return dynamodb.Table(DYNAMODB_TABLE)
 
 
class ThumbnailQueryRequest(BaseModel):
    thumbnail_url: str
 
 
@app.post("/query/thumbnail")
def query_by_thumbnail(body: ThumbnailQueryRequest, authorization: str = Header(None)):
    # Step 1 — Validate Cognito JWT (cross-cloud auth)
    validate_cognito_token(authorization)
 
    # Step 2 — Query DynamoDB for the file with this thumbnail URL
    table = get_dynamodb_table()
    try:
        response = table.scan(
            FilterExpression=Attr("thumbnail_url").eq(body.thumbnail_url)
        )
    except Exception as e:
        logger.error("DynamoDB error: %s", e)
        raise HTTPException(status_code=500, detail="Database query failed")
 
    items = response.get("Items", [])
    if not items:
        raise HTTPException(status_code=404, detail="No file found for this thumbnail URL")
 
    item = items[0]
    return {
        "original_url": item.get("file_url"),
        "thumbnail_url": item.get("thumbnail_url"),
        "tags": item.get("tags", {}),
        "file_type": item.get("file_type"),
    }
 
 
@app.get("/health")
def health():
    return {"status": "ok", "service": "query-thumbnail"}