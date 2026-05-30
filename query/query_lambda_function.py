import os
import boto3
import hashlib
import tempfile
from mangum import Mangum
from fastapi import FastAPI, HTTPException, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict
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


# Helper — DynamoDB returns Decimals, JSON can't serialize them
def fix_decimals(obj):
    if isinstance(obj, list):
        return [fix_decimals(i) for i in obj]
    elif isinstance(obj, dict):
        return {k: fix_decimals(v) for k, v in obj.items()}
    elif isinstance(obj, Decimal):
        return int(obj) if obj % 1 == 0 else float(obj)
    return obj

# 1. POST /query/tags — AND logic with minimum counts
class TagQuery(BaseModel):
    tags: Dict[str, int]

@app.post("/query/tags")
def query_by_tags(query: TagQuery):
    response = table.scan()
    results = []
    for item in response['Items']:
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

# 2. POST /query/species — at least 1 of the species present
class SpeciesQuery(BaseModel):
    species: List[str]

@app.post("/query/species")
def query_by_species(query: SpeciesQuery):
    response = table.scan()
    results = []
    for item in response['Items']:
        file_tags = item.get('tags', {})
        # If empty species list, return all files
        if not query.species or query.species == [''] or any(sp in file_tags for sp in query.species if sp):
            results.append({
                "original_url": item.get("file_url"),
                "thumbnail_url": item.get("thumbnail_url"),
                "file_type": item.get("file_type"),
                "tags": fix_decimals(file_tags)
            })
    return {"results": results}

# 3. POST /query/thumbnail — get full image from thumbnail URL
class ThumbnailQuery(BaseModel):
    thumbnail_url: str

@app.post("/query/thumbnail")
def query_by_thumbnail(query: ThumbnailQuery):
    response = table.scan(
        FilterExpression=boto3.dynamodb.conditions.Attr('thumbnail_url').eq(query.thumbnail_url)
    )
    if not response['Items']:
        raise HTTPException(status_code=404, detail="Thumbnail not found")
    return {"original_url": response['Items'][0].get("original_url")}

# 4. POST /tags — add (operation=1) or remove (operation=0) tags
class TagUpdate(BaseModel):
    urls: List[str]
    tags: List[str]
    operation: int

@app.post("/tags")
def update_tags(update: TagUpdate):
    response = table.scan(
        FilterExpression=boto3.dynamodb.conditions.Attr('original_url').is_in(update.urls)
    )
    updated = 0
    for item in response['Items']:
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

# 5. DELETE /files - remove from DynamoDB (S3 deletion handled by Lambda)
class DeleteRequest(BaseModel):
    urls: List[str]

@app.delete("/files")
def delete_files(request: DeleteRequest):
    response = table.scan(
        FilterExpression=boto3.dynamodb.conditions.Attr('original_url').is_in(request.urls)
    )
    if not response['Items']:
        raise HTTPException(status_code=404, detail="No matching files found")
    deleted = 0
    for item in response['Items']:
        table.delete_item(Key={'fileId': item['fileId']})
        deleted += 1
    return {"deleted": deleted}

# 6. POST /query/file — find matching files by uploading a sample file
@app.post("/query/file")
async def query_by_file(file: UploadFile = File(...)):
    contents = await file.read()
    try:
        checksum = hashlib.sha256(contents).hexdigest()
        response = table.scan(
            FilterExpression=boto3.dynamodb.conditions.Attr('checksum').eq(checksum)
        )
        if response['Items']:
            results = [{
                "thumbnail_url": item.get("thumbnail_url"),
                "file_url": item.get("file_url"),
                "file_type": item.get("file_type"),
                "tags": fix_decimals(item.get("tags", {}))
            } for item in response['Items']]
            return {"results": results, "match_type": "exact"}
        return {"results": [], "match_type": "none", "message": "No matching files found"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    
lambda_handler = Mangum(app)