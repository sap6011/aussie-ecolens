import json
import logging
import os
import boto3
from botocore.exceptions import ClientError

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

S3_BUCKET = os.environ.get("BUCKET_NAME", "aussie-ecolens-media")

def lambda_handler(event, context):
    """
    Two modes:
    1. Called from API Gateway → generate presigned URL for direct S3 upload
    2. Called from S3 event → run deduplication
    """
    
    # Mode 1: API Gateway request → generate presigned URL
    if "httpMethod" in event or "requestContext" in event:
        return generate_presigned_url(event, context)
    
    # Mode 2: S3 event → run deduplication
    return run_deduplication(event, context)


def generate_presigned_url(event, context):
    """Generate a presigned S3 URL for direct upload from browser"""
    try:
        body = json.loads(event.get("body") or "{}")
        filename = body.get("filename", "upload.jpg")
        content_type = body.get("content_type", "image/jpeg")
        
        s3_client = boto3.client("s3")
        
        # Generate presigned URL valid for 5 minutes
        presigned_url = s3_client.generate_presigned_url(
            "put_object",
            Params={
                "Bucket": S3_BUCKET,
                "Key": f"uploads/{filename}",
                "ContentType": content_type
            },
            ExpiresIn=300
        )
        
        return {
            "statusCode": 200,
            "headers": {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers": "Authorization,Content-Type",
            },
            "body": json.dumps({
                "upload_url": presigned_url,
                "key": f"uploads/{filename}"
            })
        }
    except ClientError as e:
        logger.error("Failed to generate presigned URL: %s", e)
        return {
            "statusCode": 500,
            "headers": {"Access-Control-Allow-Origin": "*"},
            "body": json.dumps({"error": str(e)})
        }


def run_deduplication(event, context):
    """Run deduplication on S3 uploaded file"""
    import hashlib
    
    
    s3_client = boto3.client("s3")
    dynamodb = boto3.resource("dynamodb")
    table = dynamodb.Table(os.environ.get("DYNAMODB_TABLE", "aussie-ecolens-files"))
    
    results = []
    
    for record in event.get("Records", []):
        bucket = record["s3"]["bucket"]["name"]
        key = record["s3"]["object"]["key"]
        
        logger.info("Processing: s3://%s/%s", bucket, key)
        
        # Download file
        obj = s3_client.get_object(Bucket=bucket, Key=key)
        file_bytes = obj["Body"].read()
        
        # Compute checksum
        checksum = hashlib.sha256(file_bytes).hexdigest()
        
        # Check duplicate
        response = table.query(
            IndexName="checksum-index",
            KeyConditionExpression="checksum = :cs",
            ExpressionAttributeValues={":cs": checksum},
            Limit=1
        )
        
        if response.get("Items"):
            # Duplicate — delete from S3
            s3_client.delete_object(Bucket=bucket, Key=key)
            logger.warning("Duplicate detected, deleted: %s", key)
            results.append({"status": "duplicate", "key": key})
        else:
            # New file — invoke tagger
            lambda_client = boto3.client("lambda")
            lambda_client.invoke(
                FunctionName=os.environ.get("TAGGER_FUNCTION", "aussie-ecolens-tagger"),
                InvocationType="Event",
                Payload=json.dumps({        
                    "Records": [{
                        "s3": {
                            "bucket": {"name": bucket},
                            "object": {"key": key}
                        }
                    }]
                })                          
            )
            results.append({"status": "accepted", "key": key, "checksum": checksum})
    
    return {"statusCode": 200, "body": json.dumps(results)}