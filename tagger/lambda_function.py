"""
FIT5225 A2 — ML Tagging Lambda
--------------------------------
Triggered after a new file is confirmed (post-deduplication).
Full pipeline:
  1. Download image/video from S3
  2. Download models from S3 (cached in /tmp for Lambda warm starts)
  3. Run MegaDetector → detect animals → crop bounding boxes
  4. Run SpeciesNet on each crop → get species tags + counts
  5. Save tags, file URL, thumbnail URL, file type to DynamoDB

Environment variables (set in Lambda console):
  BUCKET_NAME        — S3 bucket where media files live
  MODEL_BUCKET       — S3 bucket where models are stored (can be same bucket)
  MEGADETECTOR_KEY   — S3 key for mdv5a.pt  e.g. "models/mdv5a.pt"
  SPECIESNET_KEY     — S3 key for model.pt  e.g. "models/model.pt"
  DYNAMODB_TABLE     — DynamoDB table name  e.g. "wildlife-files"
  CONF_THRESH        — MegaDetector confidence threshold (default 0.05)
  SNIP_SIZE          — Crop size in pixels (default 600)

DynamoDB item schema:
  {
    "file_id"       : str  (S3 key — partition key),
    "file_url"      : str  (s3://bucket/key),
    "thumbnail_url" : str  (s3://bucket/thumbnails/key_thumb.jpg),
    "file_type"     : str  ("image" | "video"),
    "checksum"      : str  (SHA-256),
    "tags"          : map  { "Felis_catus": 2, "Sus_scrofa": 1 },
    "created_at"    : str  (ISO timestamp)
  }

Local testing: run `python tagging.py` directly.
"""

import io
import json
import logging
import os
import tempfile
import hashlib
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

import boto3
import numpy as np
import torch
import torchvision.transforms as transforms
from PIL import Image
from botocore.exceptions import ClientError
from megadetector.detection import run_detector_batch

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# ---------------------------------------------------------------------------
# Config from environment variables
# ---------------------------------------------------------------------------
BUCKET_NAME      = os.environ.get("BUCKET_NAME", "aussie-ecolens-media")
MODEL_BUCKET     = os.environ.get("MODEL_BUCKET", "aussie-ecolens-models")
MEGADETECTOR_KEY = os.environ.get("MEGADETECTOR_KEY", "models/mdv5a.pt")
SPECIESNET_KEY   = os.environ.get("SPECIESNET_KEY", "models/model.pt")
DYNAMODB_TABLE   = os.environ.get("DYNAMODB_TABLE", "aussie-ecolens-files")
CONF_THRESH      = float(os.environ.get("CONF_THRESH", "0.05"))
SNIP_SIZE        = int(os.environ.get("SNIP_SIZE", "600"))

# Lambda /tmp is 512MB–10GB and persists across warm invocations
TMP_DIR          = Path(tempfile.gettempdir())
MD_MODEL_PATH    = TMP_DIR / "mdv5a.pt"
SN_MODEL_PATH    = TMP_DIR / "model.pt"

CLASSES = [
    'Alectura_lathami', 'Antechinus_agilis', 'Bos_taurus', 'Burhinus_grallarius',
    'Canis_familiaris', 'Chalcophaps_longirostris', 'Colluricincla_harmonica',
    'Corcorax_melanorhamphos', 'Dacelo_novaeguineae', 'Dama_dama',
    'Eopsaltria_australis', 'Felis_catus', 'Geopelia_humeralis', 'Gymnorhina_tibicen',
    'Homo_sapiens', 'Isoodon_macrourus', 'Lepus_europaeus', 'Macropus_giganteus',
    'Menura_novaehollandiae', 'Mus_musculus', 'Oryctolagus_cuniculus',
    'Perameles_nasuta', 'Pitta_versicolor', 'Rattus', 'Rattus_fuscipes',
    'Rattus_rattus', 'Strepera_graculina', 'Sus_scrofa', 'Tachyglossus_aculeatus',
    'Thylogale_stigmatica', 'Trichosurus_caninus', 'Trichosurus_cunninghami',
    'Trichosurus_vulpecula', 'Varanus_varius', 'Vombatus_ursinus', 'Vulpes_vulpes',
    'Wallabia_bicolor', 'Canis_dingo', 'Capra_hircus', 'Casuarius_casuarius',
    'Heteromyias_cinereifrons', 'Hypsiprymnodon_moschatus', 'Megapodius_reinwardt',
    'Notamacropus_rufogriseus', 'Orthonyx_spaldingii', 'Uromys_caudimaculatus',
]

# Transform applied to each crop before SpeciesNet
TRANSFORM = transforms.Compose([
    transforms.Resize((480, 480)),
    transforms.ToTensor(),
])

# ---------------------------------------------------------------------------
# Model loading — cached in /tmp across warm Lambda invocations
# (models are only re-downloaded if /tmp was cleared i.e. cold start)
# ---------------------------------------------------------------------------

def _download_if_missing(s3_client, bucket: str, key: str, dest: Path) -> None:
    """Download a file from S3 to dest only if it doesn't already exist."""
    if dest.exists():
        logger.info("Model cache hit: %s", dest)
        return
    logger.info("Downloading model s3://%s/%s → %s", bucket, key, dest)
    s3_client.download_file(bucket, key, str(dest))
    logger.info("Downloaded %.1f MB", dest.stat().st_size / 1e6)


# Module-level cache so models survive across warm invocations
_speciesnet_model = None
_device           = None


def get_device() -> str:
    if torch.cuda.is_available():
        return "cuda"
    if torch.backends.mps.is_available():
        return "mps"
    return "cpu"


def load_models(s3_client) -> None:
    """Download models from S3 (if needed) and load SpeciesNet into memory."""
    global _speciesnet_model, _device

    _download_if_missing(s3_client, MODEL_BUCKET, MEGADETECTOR_KEY, MD_MODEL_PATH)
    _download_if_missing(s3_client, MODEL_BUCKET, SPECIESNET_KEY,   SN_MODEL_PATH)

    if _speciesnet_model is None:
        _device = get_device()
        logger.info("Loading SpeciesNet on device: %s", _device)
        _speciesnet_model = torch.load(
            str(SN_MODEL_PATH), map_location=_device, weights_only=False
        )
        _speciesnet_model.eval()
        _speciesnet_model.to(_device)
        logger.info("SpeciesNet loaded")


# ---------------------------------------------------------------------------
# Core pipeline functions
# ---------------------------------------------------------------------------

def detect_animals(image_paths: list[str]) -> list[dict]:
    """Run MegaDetector on a list of local image paths. Returns MD output."""
    logger.info("Running MegaDetector on %d images", len(image_paths))
    results = run_detector_batch.load_and_run_detector_batch(
        image_file_names=image_paths,
        model_file=str(MD_MODEL_PATH),
    )
    return results


def crop_detections(md_results: list[dict], work_dir: Path) -> list[Path]:
    """
    Extract animal crops from MegaDetector results.
    Returns list of paths to cropped images saved in work_dir.
    """
    crops = []
    for entry in md_results:
        img_path = Path(entry["file"])
        if not img_path.exists():
            continue

        crop_num = 0
        for detection in entry.get("detections", []):
            if detection["category"] != "1":        # category 1 = animal
                continue
            if detection["conf"] < CONF_THRESH:
                continue

            img = Image.open(img_path).convert("RGB")
            W, H = img.size
            x, y, w, h = detection["bbox"]

            crop = img.crop((
                int(x * W),
                int(y * H),
                int((x + w) * W),
                int((y + h) * H),
            ))
            resized = crop.resize((SNIP_SIZE, SNIP_SIZE), Image.BILINEAR)

            out_path = work_dir / f"{img_path.stem}-{crop_num}.jpg"
            resized.save(out_path)
            crops.append(out_path)
            crop_num += 1

    logger.info("Extracted %d crops", len(crops))
    return crops


@torch.no_grad()
def classify_crop(image_path: Path) -> str:
    """Run SpeciesNet on a single crop. Returns the predicted species label."""
    img = Image.open(image_path).convert("RGB")
    tensor = TRANSFORM(img)             # C, H, W
    tensor = tensor.unsqueeze(0)        # 1, C, H, W
    tensor = tensor.permute(0, 2, 3, 1) # 1, H, W, C
    tensor = tensor.to(_device)

    logits = _speciesnet_model(tensor)
    probs  = torch.softmax(logits, dim=1)[0].cpu().numpy()
    return CLASSES[int(np.argmax(probs))]


def tag_image(local_image_path: Path, work_dir: Path) -> dict[str, int]:
    """
    Full pipeline for a single image:
    MegaDetector → crop → SpeciesNet → tag counts.
    Returns e.g. {"Felis_catus": 2, "Sus_scrofa": 1}
    """
    md_results = detect_animals([str(local_image_path)])
    crops      = crop_detections(md_results, work_dir)

    if not crops:
        logger.warning("No animals detected in %s", local_image_path.name)
        return {}

    predictions = [classify_crop(c) for c in crops]
    return dict(Counter(predictions))


def thumbnail_url_for(bucket: str, original_key: str) -> str:
    """Derive the expected thumbnail S3 URL from the original file key."""
    stem = Path(original_key).stem
    return f"s3://{bucket}/thumbnails/{stem}_thumb.jpg"


def save_to_dynamodb(table, item: dict) -> None:
    """Write a tagged file record to DynamoDB."""
    # DynamoDB requires Decimal for numbers — tags counts are small ints, fine as-is
    from boto3.dynamodb.types import TypeSerializer
    table.put_item(Item=item)
    logger.info("Saved DynamoDB record for %s", item["file_id"])


# ---------------------------------------------------------------------------
# Lambda handler
# ---------------------------------------------------------------------------

def lambda_handler(event, context):
    """
    Entry point for AWS Lambda.
    Triggered by S3 ObjectCreated event (after deduplication passes).

    For each uploaded file:
      - Images: run full tagging pipeline
      - Videos: extract 1 frame/sec, tag each frame, merge tag counts
    """
    s3_client = boto3.client("s3")
    dynamodb  = boto3.resource("dynamodb")
    table     = dynamodb.Table(DYNAMODB_TABLE)

    # Ensure models are loaded (cached across warm invocations)
    load_models(s3_client)

    results = []

    # Support both S3 events and direct Lambda invoke
    if "Records" in event:
        records = [{"bucket": r["s3"]["bucket"]["name"], "key": r["s3"]["object"]["key"]} for r in event["Records"]]
    else:
        records = [{"bucket": event.get("bucket"), "key": event.get("key")}]

    for record in records:
        bucket = record["bucket"]
        key    = record["key"]

        

        # Skip thumbnail files — they are generated by the thumbnail Lambda
        if "thumbnails/" in key:
            continue

        logger.info("Tagging file: s3://%s/%s", bucket, key)

        # Determine file type
        suffix     = Path(key).suffix.lower()
        is_video   = suffix in {".mp4", ".avi", ".mov", ".mkv"}
        is_image   = suffix in {".jpg", ".jpeg", ".png", ".bmp", ".tiff"}

        if not (is_image or is_video):
            logger.warning("Unsupported file type: %s — skipping", suffix)
            continue

        # Use a per-invocation temp directory to avoid collisions
        with tempfile.TemporaryDirectory() as tmp:
            work_dir = Path(tmp)

            # Download file from S3
            local_file = work_dir / Path(key).name
            try:
                s3_client.download_file(bucket, key, str(local_file))
            except ClientError as e:
                logger.error("Failed to download %s: %s", key, e)
                raise

            # Compute checksum
            checksum = hashlib.sha256(local_file.read_bytes()).hexdigest()

            # Tag file
            if is_image:
                tags      = tag_image(local_file, work_dir)
                file_type = "image"

            else:
                # Video: extract 1 frame/sec, tag each frame, merge counts
                tags      = tag_video(local_file, work_dir)
                file_type = "video"

        file_url   = f"s3://{bucket}/{key}"
        thumb_url  = thumbnail_url_for(bucket, key) if is_image else None

        item = {
            "file_id"       : key,
            "file_url"      : file_url,
            "thumbnail_url" : thumb_url,
            "file_type"     : file_type,
            "checksum"      : checksum,
            "tags"          : tags,
            "created_at"    : datetime.now(timezone.utc).isoformat(),
        }

        save_to_dynamodb(table, item)

         # Invoke thumbnail Lambda for images
        if is_image:
            lambda_client = boto3.client("lambda")
            lambda_client.invoke(
                FunctionName=os.environ.get("THUMBNAIL_FUNCTION", "aussie-ecolens-thumbnail"),
                InvocationType="Event",
                Payload=json.dumps({
                    "bucket": bucket,
                    "key": key
                })
            )

        # Send SNS notification if tags were detected
        sns_client = boto3.client("sns")
        sns_topic_arn = os.environ.get("SNS_TOPIC_ARN")
        if sns_topic_arn and tags:
            sns_client.publish(
                TopicArn=sns_topic_arn,
                Subject=f"New wildlife detected in {Path(key).name}",
                Message=f"Species detected: {json.dumps(tags)}\nFile URL: {file_url}"
            )

        results.append({
            "file_url" : file_url,
            "file_type": file_type,
            "tags"     : tags,
        })

        logger.info("Tagged %s → %s", key, tags)

    return {
        "statusCode": 200,
        "body"      : json.dumps(results),
    }


# ---------------------------------------------------------------------------
# Video frame extraction (1 frame/sec)
# ---------------------------------------------------------------------------

def tag_video(local_video_path: Path, work_dir: Path) -> dict[str, int]:
    """
    Extract 1 frame per second from a video, tag each frame,
    and return merged tag counts across all frames.
    """
    try:
        import cv2
    except ImportError:
        raise RuntimeError("opencv-python is required for video processing.")

    cap = cv2.VideoCapture(str(local_video_path))
    if not cap.isOpened():
        raise ValueError(f"Could not open video: {local_video_path}")

    fps        = cap.get(cv2.CAP_PROP_FPS) or 1
    frame_step = max(1, int(round(fps)))   # grab 1 frame per second
    all_tags   = Counter()
    frame_idx  = 0
    saved      = 0

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        if frame_idx % frame_step == 0:
            frame_path = work_dir / f"frame_{saved:05d}.jpg"
            cv2.imwrite(str(frame_path), frame)
            frame_tags = tag_image(frame_path, work_dir / f"crops_{saved}")
            work_dir.joinpath(f"crops_{saved}").mkdir(exist_ok=True)
            all_tags  += Counter(frame_tags)
            saved     += 1

        frame_idx += 1

    cap.release()
    logger.info("Video: %d frames extracted, tags: %s", saved, dict(all_tags))
    return dict(all_tags)


# ---------------------------------------------------------------------------
# Local testing (no AWS needed)
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import sys

    # Check models exist locally
    if not Path("./mdv5a.pt").exists() or not Path("./model.pt").exists():
        print("ERROR: mdv5a.pt and model.pt must be in the current directory for local testing.")
        sys.exit(1)

    # Override /tmp paths to local for testing
    MD_MODEL_PATH = Path("./mdv5a.pt")
    SN_MODEL_PATH = Path("./model.pt")

    # Load models directly (skip S3 download)
    _device = get_device()
    print(f"Using device: {_device}")

    import onnx2torch  # noqa: ensure dependency present
    _speciesnet_model = torch.load(
        str(SN_MODEL_PATH), map_location=_device, weights_only=False
    )
    _speciesnet_model.eval()
    _speciesnet_model.to(_device)
    print("Models loaded")

    # Run on all images in test_images/
    test_dir  = Path("./test_images")
    work_dir  = Path("./tagging_test_crops")
    work_dir.mkdir(exist_ok=True)

    image_files = list(test_dir.glob("*.JPG")) + list(test_dir.glob("*.jpg"))
    print(f"\nTagging {len(image_files)} images...\n")

    all_results = {}
    for img_path in sorted(image_files):
        tags = tag_image(img_path, work_dir)
        all_results[img_path.name] = tags
        print(f"  {img_path.name:<45} → {tags}")

    print("\n--- Summary ---")
    for fname, tags in all_results.items():
        print(f"  {fname}: {tags}")

    print("\nLocal tagging test complete.")