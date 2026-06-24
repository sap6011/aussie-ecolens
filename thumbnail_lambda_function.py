import io
import json
import logging
import os
import boto3
from PIL import Image
from botocore.exceptions import ClientError

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

THUMBNAIL_MAX_WIDTH  = int(os.environ.get("THUMBNAIL_MAX_WIDTH",  "300"))
THUMBNAIL_MAX_HEIGHT = int(os.environ.get("THUMBNAIL_MAX_HEIGHT", "300"))
THUMBNAIL_QUALITY    = int(os.environ.get("THUMBNAIL_QUALITY",    "85"))
THUMBNAIL_PREFIX     = os.environ.get("THUMBNAIL_PREFIX", "thumbnails/")
GCP_BUCKET_NAME      = os.environ.get("GCP_BUCKET_NAME", "aussie-ecolens-thumbnails")
GCP_SECRET_NAME      = os.environ.get("GCP_SECRET_NAME", "gcp-thumbnail-service-account-key")


def get_gcp_client():
    import json as json_mod
    from google.cloud import storage
    from google.oauth2 import service_account
    secrets_client = boto3.client("secretsmanager")
    secret = secrets_client.get_secret_value(SecretId=GCP_SECRET_NAME)
    creds_dict = json_mod.loads(secret["SecretString"])
    credentials = service_account.Credentials.from_service_account_info(creds_dict)
    return storage.Client(credentials=credentials, project=creds_dict["project_id"])


def generate_thumbnail(image_bytes):
    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    img.thumbnail((THUMBNAIL_MAX_WIDTH, THUMBNAIL_MAX_HEIGHT), Image.LANCZOS)
    output = io.BytesIO()
    img.save(output, format="JPEG", quality=THUMBNAIL_QUALITY)
    return output.getvalue()


def thumbnail_key(original_key):
    filename = original_key.split("/")[-1]
    stem, _ = os.path.splitext(filename)
    return f"{THUMBNAIL_PREFIX}{stem}_thumb.jpg"


def lambda_handler(event, context):
    s3_client = boto3.client("s3")
    dynamodb  = boto3.resource("dynamodb")
    table     = dynamodb.Table(os.environ.get("DYNAMODB_TABLE", "aussie-ecolens-files"))

    records = event.get("Records") or [event]

    for record in records:
        if "s3" in record:
            bucket = record["s3"]["bucket"]["name"]
            key    = record["s3"]["object"]["key"]
        else:
            bucket = record.get("bucket")
            key    = record.get("key")

        if not bucket or not key:
            continue
        if key.startswith(THUMBNAIL_PREFIX):
            continue

        logger.info("Generating thumbnail for s3://%s/%s", bucket, key)

        obj = s3_client.get_object(Bucket=bucket, Key=key)
        image_bytes = obj["Body"].read()

        thumb_bytes = generate_thumbnail(image_bytes)

        gcs_client = get_gcp_client()
        bucket_gcs = gcs_client.bucket(GCP_BUCKET_NAME)
        thumb_gcs_key = thumbnail_key(key)
        blob = bucket_gcs.blob(thumb_gcs_key)
        blob.upload_from_string(thumb_bytes, content_type="image/jpeg")
        

        thumb_url = f"https://storage.googleapis.com/{GCP_BUCKET_NAME}/{thumb_gcs_key}"
        logger.info("Uploaded thumbnail to GCP: %s", thumb_url)

        table.update_item(
            Key={"fileId": key},
            UpdateExpression="SET thumbnail_url = :url",
            ExpressionAttributeValues={":url": thumb_url}
        )
        logger.info("Updated DynamoDB thumbnail_url for %s", key)

    return {"statusCode": 200, "body": json.dumps({"status": "ok"})}