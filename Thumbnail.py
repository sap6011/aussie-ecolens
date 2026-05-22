"""
FIT5225 A2 — Thumbnail Generation Lambda
-----------------------------------------
Triggered after deduplication passes (new file confirmed).
Downloads the image from S3, resizes it to thumbnail dimensions
while maintaining aspect ratio, compresses it, and uploads
the thumbnail back to S3 under a thumbnails/ prefix.

Thumbnail URL is returned for downstream Lambdas (tagging)
to store in DynamoDB.

Local testing: run `python thumbnail.py` directly.
"""

import io
import json
import logging
import os
import boto3
import cv2
import numpy as np
from botocore.exceptions import ClientError

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# ---------------------------------------------------------------------------
# Config — set these as Lambda environment variables
# ---------------------------------------------------------------------------
THUMBNAIL_MAX_WIDTH  = int(os.environ.get("THUMBNAIL_MAX_WIDTH",  "300"))
THUMBNAIL_MAX_HEIGHT = int(os.environ.get("THUMBNAIL_MAX_HEIGHT", "300"))
THUMBNAIL_QUALITY    = int(os.environ.get("THUMBNAIL_QUALITY",    "85"))   # JPEG 0-100
THUMBNAIL_PREFIX     = os.environ.get("THUMBNAIL_PREFIX", "thumbnails/")


# ---------------------------------------------------------------------------
# Core logic (no AWS deps — easy to unit test locally)
# ---------------------------------------------------------------------------

def compute_thumbnail_size(orig_w: int, orig_h: int,
                            max_w: int, max_h: int) -> tuple[int, int]:
    """
    Return (new_w, new_h) that fits within max_w x max_h
    while preserving the original aspect ratio.
    """
    ratio = min(max_w / orig_w, max_h / orig_h)
    return max(1, int(orig_w * ratio)), max(1, int(orig_h * ratio))


def generate_thumbnail(image_bytes: bytes,
                        max_w: int = THUMBNAIL_MAX_WIDTH,
                        max_h: int = THUMBNAIL_MAX_HEIGHT,
                        quality: int = THUMBNAIL_QUALITY) -> bytes:
    """
    Accept raw image bytes, return JPEG thumbnail bytes.
    Uses OpenCV for resizing and compression.
    """
    # Decode image bytes → numpy array → OpenCV BGR image
    np_arr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)

    if img is None:
        raise ValueError("Could not decode image — unsupported format or corrupt file.")

    orig_h, orig_w = img.shape[:2]
    new_w, new_h = compute_thumbnail_size(orig_w, orig_h, max_w, max_h)

    logger.info("Resizing %dx%d → %dx%d", orig_w, orig_h, new_w, new_h)

    # INTER_AREA is best for downscaling
    resized = cv2.resize(img, (new_w, new_h), interpolation=cv2.INTER_AREA)

    # Encode back to JPEG bytes with compression
    encode_params = [cv2.IMWRITE_JPEG_QUALITY, quality]
    success, buffer = cv2.imencode(".jpg", resized, encode_params)

    if not success:
        raise RuntimeError("Failed to encode thumbnail as JPEG.")

    return buffer.tobytes()


def thumbnail_key(original_key: str, prefix: str = THUMBNAIL_PREFIX) -> str:
    """
    Derive the S3 key for the thumbnail from the original file key.
    e.g. 'uploads/koala.jpg' → 'thumbnails/koala_thumb.jpg'
    """
    filename = original_key.split("/")[-1]
    stem, _ = os.path.splitext(filename)
    return f"{prefix}{stem}_thumb.jpg"


# ---------------------------------------------------------------------------
# Lambda handler
# ---------------------------------------------------------------------------

def lambda_handler(event, context):
    """
    Entry point for AWS Lambda.

    Can be triggered two ways:
      1. Directly from deduplication Lambda output (recommended)
      2. S3 ObjectCreated event (fallback)

    The handler:
      1. Downloads the original image from S3.
      2. Generates a thumbnail using OpenCV.
      3. Uploads the thumbnail to S3 under thumbnails/ prefix.
      4. Returns the thumbnail S3 URL for the tagging Lambda.
    """
    s3_client = boto3.client("s3")
    results = []

    # Support both direct invocation payload and S3 event records
    records = event.get("Records") or [event]

    for record in records:
        # Parse bucket + key from either S3 event or direct payload
        if "s3" in record:
            bucket = record["s3"]["bucket"]["name"]
            key    = record["s3"]["object"]["key"]
        else:
            bucket = record.get("bucket")
            key    = record.get("key")

        if not bucket or not key:
            logger.error("Missing bucket or key in event: %s", record)
            continue

        # Skip if this is already a thumbnail (avoid re-processing)
        if key.startswith(THUMBNAIL_PREFIX):
            logger.info("Skipping thumbnail of thumbnail: %s", key)
            continue

        logger.info("Generating thumbnail for s3://%s/%s", bucket, key)

        # 1. Download original image
        try:
            obj = s3_client.get_object(Bucket=bucket, Key=key)
            image_bytes = obj["Body"].read()
        except ClientError as e:
            logger.error("Failed to read S3 object: %s", e)
            raise

        # 2. Generate thumbnail
        try:
            thumb_bytes = generate_thumbnail(image_bytes)
        except (ValueError, RuntimeError) as e:
            logger.error("Thumbnail generation failed: %s", e)
            raise

        # 3. Upload thumbnail to S3
        thumb_key = thumbnail_key(key)
        try:
            s3_client.put_object(
                Bucket=bucket,
                Key=thumb_key,
                Body=thumb_bytes,
                ContentType="image/jpeg",
            )
            logger.info("Uploaded thumbnail: s3://%s/%s", bucket, thumb_key)
        except ClientError as e:
            logger.error("Failed to upload thumbnail: %s", e)
            raise

        thumb_url = f"s3://{bucket}/{thumb_key}"
        results.append({
            "status": "ok",
            "original_key": key,
            "thumbnail_key": thumb_key,
            "thumbnail_url": thumb_url,
            "bucket": bucket,
        })

    return {
        "statusCode": 200,
        "body": json.dumps(results),
    }


# ---------------------------------------------------------------------------
# Local testing (no AWS needed)
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import urllib.request

    # Download a small test image (public domain wildlife photo)
    TEST_URL = "https://upload.wikimedia.org/wikipedia/commons/thumb/4/49/Koala_climbing_tree.jpg/320px-Koala_climbing_tree.jpg"
    print(f"Downloading test image from Wikipedia...")
    with urllib.request.urlopen(TEST_URL) as r:
        image_bytes = r.read()
    print(f"Downloaded {len(image_bytes):,} bytes")

    # Test aspect ratio calculation
    w, h = compute_thumbnail_size(1920, 1080, 300, 300)
    assert w == 300 and h == 168, f"Expected 300x168, got {w}x{h}"
    print(f"Aspect ratio OK: 1920x1080 → {w}x{h}")

    w, h = compute_thumbnail_size(100, 200, 300, 300)
    assert w == 150 and h == 300, f"Expected 150x300, got {w}x{h}"
    print(f"Aspect ratio OK: 100x200 → {w}x{h}")

    # Test thumbnail generation
    thumb_bytes = generate_thumbnail(image_bytes, max_w=300, max_h=300, quality=85)
    assert len(thumb_bytes) > 0, "Thumbnail should not be empty"
    assert len(thumb_bytes) < len(image_bytes), "Thumbnail should be smaller than original"
    print(f"Thumbnail OK: {len(image_bytes):,} bytes → {len(thumb_bytes):,} bytes")

    # Save thumbnail locally so you can visually inspect it
    output_path = "test_thumbnail.jpg"
    with open(output_path, "wb") as f:
        f.write(thumb_bytes)
    print(f"Saved thumbnail to: {output_path}")

    # Test key derivation
    assert thumbnail_key("uploads/koala.jpg")      == "thumbnails/koala_thumb.jpg"
    assert thumbnail_key("uploads/sub/wombat.png") == "thumbnails/wombat_thumb.jpg"
    print("Key derivation OK")

    print("\nAll local tests passed.")