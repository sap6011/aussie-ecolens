import json
import logging
import os
import boto3
from botocore.exceptions import ClientError
from urllib.parse import unquote_plus

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

S3_BUCKET = os.environ.get("BUCKET_NAME", "aussie-ecolens-media")

def lambda_handler(event, context):
    if "httpMethod" in event or "requestContext" in event:
        return generate_presigned_url(event, context)
    return run_deduplication(event, context)


def generate_presigned_url(event, context):
    try:
        body = json.loads(event.get("body") or "{}")
        filename = body.get("filename", "upload.jpg")
        content_type = body.get("content_type", "image/jpeg")

        claims = event.get("requestContext", {}).get("authorizer", {}).get("claims", {})
        user_id = claims.get("sub", "unknown")

        s3_client = boto3.client("s3")

        presigned_url = s3_client.generate_presigned_url(
            "put_object",
            Params={
                "Bucket": S3_BUCKET,
                "Key": f"uploads/{filename}",
                "ContentType": content_type,
                "Metadata": {"userid": user_id}
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
                "key": f"uploads/{filename}",
                "user_id": user_id
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
    import hashlib

    s3_client = boto3.client("s3")
    dynamodb = boto3.resource("dynamodb")
    table = dynamodb.Table(os.environ.get("DYNAMODB_TABLE", "aussie-ecolens-files"))

    results = []

    for record in event.get("Records", []):
        bucket = record["s3"]["bucket"]["name"]
        key = unquote_plus(record["s3"]["object"]["key"])  # ← decode URL-encoded key

        logger.info("Processing: s3://%s/%s", bucket, key)

        obj = s3_client.get_object(Bucket=bucket, Key=key)
        file_bytes = obj["Body"].read()

        user_id = obj.get("Metadata", {}).get("userid", "unknown")
        logger.info("userId from metadata: %s", user_id)

        checksum = hashlib.sha256(file_bytes).hexdigest()

        response = table.query(
            IndexName="checksum-index",
            KeyConditionExpression="checksum = :cs",
            ExpressionAttributeValues={":cs": checksum},
            Limit=1
        )

        if response.get("Items"):
            s3_client.delete_object(Bucket=bucket, Key=key)
            logger.warning("Duplicate detected, deleted: %s", key)
            results.append({"status": "duplicate", "key": key})
        else:
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
                    }],
                    "user_id": user_id
                })
            )
            results.append({"status": "accepted", "key": key, "checksum": checksum})

    return {"statusCode": 200, "body": json.dumps(results)}