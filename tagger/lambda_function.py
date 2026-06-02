"""
FIT5225 A2 — ML Tagging Lambda
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
from botocore.exceptions import ClientError

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

BUCKET_NAME      = os.environ.get("BUCKET_NAME", "aussie-ecolens-media")
MODEL_BUCKET     = os.environ.get("MODEL_BUCKET", "aussie-ecolens-models")
MEGADETECTOR_KEY = os.environ.get("MEGADETECTOR_KEY", "models/mdv5a.pt")
SPECIESNET_KEY   = os.environ.get("SPECIESNET_KEY", "models/model.pt")
DYNAMODB_TABLE   = os.environ.get("DYNAMODB_TABLE", "aussie-ecolens-files")
CONF_THRESH      = float(os.environ.get("CONF_THRESH", "0.05"))
SNIP_SIZE        = int(os.environ.get("SNIP_SIZE", "600"))

TMP_DIR       = Path(tempfile.gettempdir())
MD_MODEL_PATH = TMP_DIR / "mdv5a.pt"
SN_MODEL_PATH = TMP_DIR / "model.pt"

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

_speciesnet_model = None
_device           = None
_torch            = None
_transforms       = None
_np               = None


def _download_if_missing(s3_client, bucket, key, dest):
    if dest.exists():
        logger.info("Model cache hit: %s", dest)
        return
    logger.info("Downloading model s3://%s/%s → %s", bucket, key, dest)
    s3_client.download_file(bucket, key, str(dest))
    logger.info("Downloaded %.1f MB", dest.stat().st_size / 1e6)


def load_models(s3_client):
    global _speciesnet_model, _device, _torch, _transforms, _np

    import torch
    import torchvision.transforms as transforms
    import numpy as np
    _torch = torch
    _transforms = transforms
    _np = np

    _download_if_missing(s3_client, MODEL_BUCKET, MEGADETECTOR_KEY, MD_MODEL_PATH)
    _download_if_missing(s3_client, MODEL_BUCKET, SPECIESNET_KEY, SN_MODEL_PATH)

    if _speciesnet_model is None:
        if torch.cuda.is_available():
            _device = "cuda"
        elif torch.backends.mps.is_available():
            _device = "mps"
        else:
            _device = "cpu"
        logger.info("Loading SpeciesNet on device: %s", _device)
        _speciesnet_model = torch.load(
            str(SN_MODEL_PATH), map_location=_device, weights_only=False
        )
        _speciesnet_model.eval()
        _speciesnet_model.to(_device)
        logger.info("SpeciesNet loaded")


def detect_animals(image_paths):
    from megadetector.detection import run_detector_batch
    logger.info("Running MegaDetector on %d images", len(image_paths))
    return run_detector_batch.load_and_run_detector_batch(
        image_file_names=image_paths,
        model_file=str(MD_MODEL_PATH),
    )


def crop_detections(md_results, work_dir):
    from PIL import Image
    crops = []
    for entry in md_results:
        img_path = Path(entry["file"])
        if not img_path.exists():
            continue
        crop_num = 0
        for detection in entry.get("detections", []):
            if detection["category"] != "1":
                continue
            if detection["conf"] < CONF_THRESH:
                continue
            img = Image.open(img_path).convert("RGB")
            W, H = img.size
            x, y, w, h = detection["bbox"]
            crop = img.crop((int(x*W), int(y*H), int((x+w)*W), int((y+h)*H)))
            resized = crop.resize((SNIP_SIZE, SNIP_SIZE), Image.BILINEAR)
            out_path = work_dir / f"{img_path.stem}-{crop_num}.jpg"
            resized.save(out_path)
            crops.append(out_path)
            crop_num += 1
    logger.info("Extracted %d crops", len(crops))
    return crops


def classify_crop(image_path):
    from PIL import Image
    transform = _transforms.Compose([
        _transforms.Resize((480, 480)),
        _transforms.ToTensor(),
    ])
    img = Image.open(image_path).convert("RGB")
    tensor = transform(img).unsqueeze(0).permute(0, 2, 3, 1).to(_device)
    with _torch.no_grad():
        logits = _speciesnet_model(tensor)
        probs = _torch.softmax(logits, dim=1)[0].cpu().numpy()
    return CLASSES[int(_np.argmax(probs))]


def tag_image(local_image_path, work_dir):
    md_results = detect_animals([str(local_image_path)])
    crops = crop_detections(md_results, work_dir)
    if not crops:
        logger.warning("No animals detected in %s", local_image_path.name)
        return {}
    predictions = [classify_crop(c) for c in crops]
    return dict(Counter(predictions))


def thumbnail_url_for(bucket, original_key):
    stem = Path(original_key).stem
    return f"s3://{bucket}/thumbnails/{stem}_thumb.jpg"


def tag_video(local_video_path, work_dir):
    import cv2
    cap = cv2.VideoCapture(str(local_video_path))
    if not cap.isOpened():
        raise ValueError(f"Could not open video: {local_video_path}")
    fps = cap.get(cv2.CAP_PROP_FPS) or 1
    frame_step = max(1, int(round(fps)))
    all_tags = Counter()
    frame_idx = 0
    saved = 0
    while True:
        ret, frame = cap.read()
        if not ret:
            break
        if frame_idx % frame_step == 0:
            frame_path = work_dir / f"frame_{saved:05d}.jpg"
            cv2.imwrite(str(frame_path), frame)
            crops_dir = work_dir / f"crops_{saved}"
            crops_dir.mkdir(exist_ok=True)
            frame_tags = tag_image(frame_path, crops_dir)
            all_tags += Counter(frame_tags)
            saved += 1
        frame_idx += 1
    cap.release()
    logger.info("Video: %d frames, tags: %s", saved, dict(all_tags))
    return dict(all_tags)


def lambda_handler(event, context):
    s3_client = boto3.client("s3")
    dynamodb  = boto3.resource("dynamodb")
    table     = dynamodb.Table(DYNAMODB_TABLE)

    load_models(s3_client)

    results = []

    if "Records" in event:
        records = [{"bucket": r["s3"]["bucket"]["name"], "key": r["s3"]["object"]["key"]} for r in event["Records"]]
    else:
        records = [{"bucket": event.get("bucket"), "key": event.get("key")}]

    user_id    = event.get("user_id", "unknown")
    query_only = event.get("query_only", False)  # ← NEW: skip save/thumbnail/SNS when True

    for record in records:
        bucket = record["bucket"]
        key    = record["key"]

        if "thumbnails/" in key:
            continue

        logger.info("Tagging file: s3://%s/%s", bucket, key)

        suffix   = Path(key).suffix.lower()
        is_video = suffix in {".mp4", ".avi", ".mov", ".mkv"}
        is_image = suffix in {".jpg", ".jpeg", ".png", ".bmp", ".tiff"}

        if not (is_image or is_video):
            logger.warning("Unsupported file type: %s — skipping", suffix)
            continue

        with tempfile.TemporaryDirectory() as tmp:
            work_dir   = Path(tmp)
            local_file = work_dir / Path(key).name
            try:
                s3_client.download_file(bucket, key, str(local_file))
            except ClientError as e:
                logger.error("Failed to download %s: %s", key, e)
                raise

            checksum = hashlib.sha256(local_file.read_bytes()).hexdigest()

            if is_image:
                tags      = tag_image(local_file, work_dir)
                file_type = "image"
            else:
                tags      = tag_video(local_file, work_dir)
                file_type = "video"

        file_url  = f"s3://{bucket}/{key}"
        thumb_url = thumbnail_url_for(bucket, key) if is_image else None

        # ── query_only: return tags without persisting anything ──────────────
        if query_only:
            logger.info("query_only=True — skipping DynamoDB/thumbnail/SNS for %s", key)
            results.append({"file_url": file_url, "file_type": file_type, "tags": tags})
            continue
        # ─────────────────────────────────────────────────────────────────────

        item = {
            "fileId"       : key,
            "file_url"     : file_url,
            "thumbnail_url": thumb_url,
            "file_type"    : file_type,
            "checksum"     : checksum,
            "tags"         : tags,
            "created_at"   : datetime.now(timezone.utc).isoformat(),
            "userId"       : user_id,
        }

        table.put_item(Item=item)
        logger.info("Saved DynamoDB record for %s", key)

        if is_image:
            boto3.client("lambda").invoke(
                FunctionName=os.environ.get("THUMBNAIL_FUNCTION", "aussie-ecolens-thumbnail"),
                InvocationType="Event",
                Payload=json.dumps({"bucket": bucket, "key": key})
            )

        sns_topic_arn = os.environ.get("SNS_TOPIC_ARN")
        if sns_topic_arn and tags:
            gcp_bucket = os.environ.get("GCP_BUCKET_NAME", "aussie-ecolens-thumbnails")
            gcs_thumb = (
                f"https://storage.googleapis.com/{gcp_bucket}/thumbnails/{Path(key).stem}_thumb.jpg"
                if is_image else "N/A"
            )
            boto3.client("sns").publish(
                TopicArn=sns_topic_arn,
                Subject=f"New wildlife detected in {Path(key).name}",
                Message=(
                    f"Species detected: {json.dumps(tags)}\n"
                    f"File: {Path(key).name}\n"
                    f"Thumbnail: {gcs_thumb}"
                )
            )

        results.append({"file_url": file_url, "file_type": file_type, "tags": tags})
        logger.info("Tagged %s → %s", key, tags)

    return {"statusCode": 200, "body": json.dumps(results)}