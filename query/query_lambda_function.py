import os
import boto3
import hashlib
import tempfile
import base64
import json
from mangum import Mangum
from fastapi import FastAPI, HTTPException, File, UploadFile, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Optional
from decimal import Decimal
from pathlib import Path
import logging

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

SNS_TOPIC_ARN = os.environ.get('SNS_TOPIC_ARN')
dynamodb = boto3.resource('dynamodb', region_name=os.getenv('AWS_REGION', 'us-east-1'))
table = dynamodb.Table(os.getenv('DYNAMODB_TABLE', 'aussie-ecolens-files'))

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_gcp_client = None

def get_gcp_client():
    import json as json_mod
    from google.cloud import storage
    from google.oauth2 import service_account
    secrets_client = boto3.client("secretsmanager")
    secret = secrets_client.get_secret_value(SecretId=GCP_SECRET_NAME)
    creds_dict = json_mod.loads(secret["SecretString"])
    credentials = service_account.Credentials.from_service_account_info(creds_dict)
    return storage.Client(credentials=credentials, project=creds_dict["project_id"])

def get_user_id_from_token(authorization: str = None):
    try:
        if not authorization:
            return None
        token = authorization.replace("Bearer ", "")
        payload = token.split(".")[1]
        payload += "=" * (4 - len(payload) % 4)
        decoded = json.loads(base64.b64decode(payload))
        return decoded.get("sub")
    except:
        return None

def fix_decimals(obj):
    if isinstance(obj, list):
        return [fix_decimals(i) for i in obj]
    elif isinstance(obj, dict):
        return {k: fix_decimals(v) for k, v in obj.items()}
    elif isinstance(obj, Decimal):
        return int(obj) if obj % 1 == 0 else float(obj)
    return obj


class SubscribeRequest(BaseModel):
    email: str

@app.post("/subscribe")
def subscribe_email(request: SubscribeRequest):
    sns = boto3.client('sns', region_name=os.getenv('AWS_REGION', 'us-east-1'))
    logger.info("Subscribing email: %s to topic: %s", request.email, SNS_TOPIC_ARN)
    try:
        response = sns.subscribe(
            TopicArn=SNS_TOPIC_ARN,
            Protocol='email',
            Endpoint=request.email
        )
        logger.info("SNS subscribe response: %s", response)
        return {"message": f"Confirmation email sent to {request.email}. Please check your inbox."}
    except Exception as e:
        logger.error("SNS subscribe failed: %s", str(e))
        raise HTTPException(status_code=500, detail=str(e))


class TagQuery(BaseModel):
    tags: Dict[str, int]

@app.post("/query/tags")
def query_by_tags(query: TagQuery, authorization: Optional[str] = Header(None)):
    user_id = get_user_id_from_token(authorization)
    response = table.scan()
    results = []
    for item in response['Items']:
        if user_id and item.get('userId') and item.get('userId') != user_id:
            continue
        file_tags = item.get('tags', {})
        if all(int(file_tags.get(tag, 0)) >= count
               for tag, count in query.tags.items()):
            results.append({
                "thumbnail_url": item.get("thumbnail_url"),
                "original_url": item.get("file_url"),
                "file_type": item.get("file_type"),
                "tags": fix_decimals(item.get("tags", {}))
            })
    return {"results": fix_decimals(results)}


class SpeciesQuery(BaseModel):
    species: List[str]

@app.post("/query/species")
def query_by_species(query: SpeciesQuery, authorization: Optional[str] = Header(None)):
    user_id = get_user_id_from_token(authorization)
    response = table.scan()
    results = []
    for item in response['Items']:
        if user_id and item.get('userId') and item.get('userId') != user_id:
            continue
        file_tags = item.get('tags', {})
        if not query.species or query.species == [''] or any(sp in file_tags for sp in query.species if sp):
            results.append({
                "original_url": item.get("file_url"),
                "thumbnail_url": item.get("thumbnail_url"),
                "file_type": item.get("file_type"),
                "tags": fix_decimals(file_tags)
            })
    return {"results": results}


class ThumbnailQuery(BaseModel):
    thumbnail_url: str

@app.post("/query/thumbnail")
def query_by_thumbnail(query: ThumbnailQuery, authorization: Optional[str] = Header(None)):
    user_id = get_user_id_from_token(authorization)
    response = table.scan(
        FilterExpression=boto3.dynamodb.conditions.Attr('thumbnail_url').eq(query.thumbnail_url)
    )
    if not response['Items']:
        raise HTTPException(status_code=404, detail="Thumbnail not found")
    item = response['Items'][0]
    if user_id and item.get('userId') and item.get('userId') != user_id:
        raise HTTPException(status_code=403, detail="Access denied")
    return {
        "original_url": item.get("file_url"),
        "thumbnail_url": item.get("thumbnail_url"),
        "file_type": item.get("file_type"),
        "tags": fix_decimals(item.get("tags", {}))
    }


class TagUpdate(BaseModel):
    urls: List[str]
    tags: List[str]
    operation: int

@app.post("/tags")
def update_tags(update: TagUpdate, authorization: Optional[str] = Header(None)):
    user_id = get_user_id_from_token(authorization)
    response = table.scan(
        FilterExpression=boto3.dynamodb.conditions.Attr('file_url').is_in(update.urls)
    )
    updated = 0
    for item in response['Items']:
        if user_id and item.get('userId') and item.get('userId') != user_id:
            continue
        current_tags = item.get('tags', {})
        if update.operation == 1:
            for tag in update.tags:
                current_tags[tag] = int(current_tags.get(tag, 0)) + 1
        else:
            for tag in update.tags:
                current_tags.pop(tag, None)
        table.update_item(
            Key={'fileId': item['fileId']},
            UpdateExpression='SET tags = :t',
            ExpressionAttributeValues={':t': current_tags}
        )
        updated += 1
    return {"updated": updated}


class DeleteRequest(BaseModel):
    urls: List[str]

@app.delete("/delete")
def delete_files(request: DeleteRequest, authorization: Optional[str] = Header(None)):
    user_id = get_user_id_from_token(authorization)
    s3_client = boto3.client('s3', region_name=os.getenv('AWS_REGION', 'us-east-1'))

    response = table.scan(
        FilterExpression=boto3.dynamodb.conditions.Attr('file_url').is_in(request.urls)
    )
    if not response['Items']:
        raise HTTPException(status_code=404, detail="No matching files found")

    deleted = 0
    for item in response['Items']:
        if user_id and item.get('userId') and item.get('userId') != user_id:
            continue
        file_url = item.get('file_url', '')
        thumbnail_url = item.get('thumbnail_url', '')

        if file_url.startswith('s3://'):
            parts = file_url.replace('s3://', '').split('/', 1)
            s3_client.delete_object(Bucket=parts[0], Key=parts[1])

        if thumbnail_url.startswith('https://storage.googleapis.com/'):
            try:
                gcs = get_gcp_client()
                bucket_name = os.environ.get('GCP_BUCKET_NAME', 'aussie-ecolens-thumbnails')
                path = thumbnail_url.split(f'{bucket_name}/')[1]
                gcs.bucket(bucket_name).blob(path).delete()
            except Exception as e:
                logger.error("Failed to delete GCP thumbnail: %s", e)

        table.delete_item(Key={'fileId': item['fileId']})
        deleted += 1

    return {"deleted": deleted}


@app.post("/query/file")
async def query_by_file(file: UploadFile = File(...), authorization: Optional[str] = Header(None)):
    user_id = get_user_id_from_token(authorization)
    contents = await file.read()
    try:
        checksum = hashlib.sha256(contents).hexdigest()
        response = table.scan(
            FilterExpression=boto3.dynamodb.conditions.Attr('checksum').eq(checksum)
        )
        if response['Items']:
            results = []
            for item in response['Items']:
                if user_id and item.get('userId') and item.get('userId') != user_id:
                    continue
                results.append({
                    "thumbnail_url": item.get("thumbnail_url"),
                    "file_url": item.get("file_url"),
                    "file_type": item.get("file_type"),
                    "tags": fix_decimals(item.get("tags", {}))
                })
            if results:
                return {"results": results, "match_type": "exact"}
        return {"results": [], "match_type": "none", "message": "No matching files found"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

lambda_handler = Mangum(app)