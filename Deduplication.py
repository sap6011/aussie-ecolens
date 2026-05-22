"""
FIT5225 A2 — File Deduplication Lambda
---------------------------------------
Triggered when a file is uploaded to S3.
Computes SHA-256 checksum of the uploaded file and checks
the database for a duplicate. If a duplicate exists, the
newly uploaded file is deleted from S3 and the original's
metadata is returned. Otherwise, processing continues.

Local testing: run `python deduplication.py` directly.
"""

import hashlib
import json
import logging
import os
import boto3
from botocore.exceptions import ClientError

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# ---------------------------------------------------------------------------
# DynamoDB config — set these as Lambda environment variables
# ---------------------------------------------------------------------------
DYNAMODB_TABLE = os.environ.get("DYNAMODB_TABLE", "aussie-ecolens-files")
CHECKSUM_INDEX = os.environ.get("CHECKSUM_INDEX", "checksum-index")  # GSI name


# ---------------------------------------------------------------------------
# Core logic (no AWS deps — easy to unit test locally)
# ---------------------------------------------------------------------------

def compute_checksum(file_bytes: bytes) -> str:
    """Return SHA-256 hex digest of file_bytes."""
    return hashlib.sha256(file_bytes).hexdigest()


def find_duplicate(checksum: str, table) -> dict | None:
    """
    Query DynamoDB GSI for an existing file with the same checksum.
    Returns the item dict if found, else None.

    Expects a GSI named CHECKSUM_INDEX with 'checksum' as the partition key.
    """
    response = table.query(
        IndexName=CHECKSUM_INDEX,
        KeyConditionExpression="checksum = :cs",
        ExpressionAttributeValues={":cs": checksum},
        Limit=1,
    )
    items = response.get("Items", [])
    return items[0] if items else None


def delete_from_s3(bucket: str, key: str, s3_client) -> None:
    """Remove a file from S3 (called when duplicate is detected)."""
    s3_client.delete_object(Bucket=bucket, Key=key)
    logger.info("Deleted duplicate from S3: s3://%s/%s", bucket, key)


# ---------------------------------------------------------------------------
# Lambda handler
# ---------------------------------------------------------------------------

def lambda_handler(event, context):
    """
    Entry point for AWS Lambda.

    Expected trigger: S3 ObjectCreated event.
    The handler:
      1. Downloads the uploaded file from S3.
      2. Computes its SHA-256 checksum.
      3. Checks DynamoDB for an existing file with the same checksum.
      4a. Duplicate found  → deletes the new file, returns 409 + original URL.
      4b. No duplicate     → returns 200 + checksum for downstream Lambdas.
    """
    s3_client = boto3.client("s3")
    dynamodb = boto3.resource("dynamodb")
    table = dynamodb.Table(DYNAMODB_TABLE)

    results = []

    for record in event.get("Records", []):
        bucket = record["s3"]["bucket"]["name"]
        key = record["s3"]["object"]["key"]

        logger.info("Processing upload: s3://%s/%s", bucket, key)

        # 1. Download file bytes from S3
        try:
            obj = s3_client.get_object(Bucket=bucket, Key=key)
            file_bytes = obj["Body"].read()
        except ClientError as e:
            logger.error("Failed to read S3 object: %s", e)
            raise

        # 2. Compute checksum
        checksum = compute_checksum(file_bytes)
        logger.info("SHA-256 checksum: %s", checksum)

        # 3. Check for duplicate in DynamoDB
        duplicate = find_duplicate(checksum, table)

        if duplicate:
            # 4a. Duplicate found — remove the redundant upload
            logger.warning(
                "Duplicate detected. Existing file: %s", duplicate.get("file_url")
            )
            delete_from_s3(bucket, key, s3_client)
            results.append({
                "status": "duplicate",
                "statusCode": 409,
                "message": "File already exists.",
                "existing_url": duplicate.get("file_url"),
                "checksum": checksum,
            })
        else:
            # 4b. New file — invoke tagger Lambda
            logger.info("New file accepted. Checksum: %s", checksum)
            lambda_client = boto3.client("lambda")
            lambda_client.invoke(
                FunctionName=os.environ.get("TAGGER_FUNCTION", "aussie-ecolens-tagger"),
                InvocationType="Event",
                Payload=json.dumps({
                    "bucket": bucket,
                    "key": key,
                    "checksum": checksum
                })
            )
            results.append({
                "status": "accepted",
                "statusCode": 200,
                "bucket": bucket,
                "key": key,
                "checksum": checksum,
            })

    return {
        "statusCode": 200,
        "body": json.dumps(results),
    }


# ---------------------------------------------------------------------------
# Local testing (no AWS needed)
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    # Test compute_checksum
    sample = b"Hello, wildlife!"
    cs = compute_checksum(sample)
    assert len(cs) == 64, "SHA-256 should be 64 hex chars"
    print(f"Checksum OK: {cs}")

    # Test duplicate detection with a mock table
    class MockTable:
        def __init__(self, existing_checksum):
            self.existing_checksum = existing_checksum

        def query(self, **kwargs):
            val = kwargs["ExpressionAttributeValues"][":cs"]
            if val == self.existing_checksum:
                return {"Items": [{"file_url": "s3://bucket/existing.jpg", "checksum": val}]}
            return {"Items": []}

    mock_table = MockTable(existing_checksum=cs)

    dup = find_duplicate(cs, mock_table)
    assert dup is not None, "Should detect duplicate"
    print(f"Duplicate detection OK: found {dup['file_url']}")

    no_dup = find_duplicate("a" * 64, mock_table)
    assert no_dup is None, "Should return None for new checksum"
    print("New file detection OK: no duplicate found")

    print("\nAll local tests passed.")