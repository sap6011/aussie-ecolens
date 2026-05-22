# Batch processing of camera-trap images using MegaDetector and fine-tuned SpeciesNet.
# 1. Load and run MegaDetector on a batch of images.
# 2. Extract detected bounding boxes and save cropped images of detected animals.
# 3. Load a fine-tuned SpeciesNet model and classify the cropped images.

from pathlib import Path
import os
import json
import warnings
warnings.filterwarnings('ignore')

import yaml
from tqdm import tqdm
from PIL import Image
import torch
import torchvision.transforms as transforms
import numpy as np
import matplotlib.pyplot as plt

from megadetector.detection import run_detector_batch


# ---------------------------------------------------------------------------
# Read YAML config — must be at top so all paths come from config.yaml
# ---------------------------------------------------------------------------
def read_yaml(path):
    with open(path, "r") as f:
        return yaml.safe_load(f)

config = read_yaml("config.yaml")

# Allow environment variables to override config values
for k in config:
    if k in os.environ:
        config[k] = os.environ[k]

INPUT_DIR   = Path(config["INPUT_DIR"])
OUTPUT_DIR  = Path(config["SNIP_DIR"])
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
MD_FILE     = Path(config["MD_FILE"])
CONF_THRESH = float(config["LOWER_CONF"])
SNIP_SIZE   = int(config["SNIP_SIZE"])


# ---------------------------------------------------------------------------
# Step 1: Run MegaDetector on all images in INPUT_DIR
# ---------------------------------------------------------------------------
files = [
    str(INPUT_DIR / f)
    for f in os.listdir(INPUT_DIR)
    if not f.startswith(".") and f.lower().endswith((".jpg", ".jpeg", ".png"))
]

print(f"Running MegaDetector on {len(files)} images...")
data = run_detector_batch.load_and_run_detector_batch(
    image_file_names=files,
    model_file="./mdv5a.pt"
)

with open(MD_FILE, "w") as f:
    json.dump(data, f)

print(f"MegaDetector results saved to {MD_FILE}")


# ---------------------------------------------------------------------------
# Step 2: Crop detected animals using MEWC-snip logic
# ---------------------------------------------------------------------------
with open(MD_FILE, "r") as f:
    md_data = json.load(f)

print(f"Processing {len(md_data)} images for cropping...")

for entry in md_data:
    img_path = Path(entry["file"])

    if not img_path.exists():
        print(f"Skipping missing file: {img_path}")
        continue

    detections = entry.get("detections", [])
    crop_num = 0

    for detection in detections:
        # Category "1" = animal in MegaDetector
        if detection["category"] != "1":
            continue

        conf = detection["conf"]
        if conf < CONF_THRESH:
            continue

        img = Image.open(img_path).convert("RGB")
        W, H = img.size

        x, y, w, h = detection["bbox"]
        left   = int(x * W)
        top    = int(y * H)
        right  = int((x + w) * W)
        bottom = int((y + h) * H)

        crop = img.crop((left, top, right, bottom))
        resized = crop.resize((SNIP_SIZE, SNIP_SIZE), Image.BILINEAR)

        out_name = f"{img_path.stem}-{crop_num}{img_path.suffix}"
        resized.save(OUTPUT_DIR / out_name)
        print(f"Saved crop: {OUTPUT_DIR / out_name}")
        crop_num += 1


# ---------------------------------------------------------------------------
# Step 3: Load fine-tuned SpeciesNet and classify cropped images
# ---------------------------------------------------------------------------
print(f"\nPyTorch version: {torch.__version__}")

MODEL_PT_PATH = "./model.pt"

if torch.cuda.is_available():
    DEVICE = "cuda"
elif torch.backends.mps.is_available():
    DEVICE = "mps"
else:
    DEVICE = "cpu"

print(f"Using device: {DEVICE}")

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

model = torch.load(MODEL_PT_PATH, map_location=DEVICE, weights_only=False)
model.eval()
model.to(DEVICE)
print("Loaded fine-tuned SpeciesNet model")

transform = transforms.Compose([
    transforms.Resize((480, 480)),
    transforms.ToTensor(),
])


@torch.no_grad()
def classify_image(image_path):
    """Classify a single cropped image and print top predictions."""
    img = Image.open(image_path).convert("RGB")

    plt.imshow(img)
    plt.axis('off')
    plt.title(str(image_path))
    plt.show()

    tensor = transform(img)          # C, H, W
    tensor = tensor.unsqueeze(0)     # 1, C, H, W
    tensor = tensor.permute(0,2,3,1) # 1, H, W, C
    tensor = tensor.to(DEVICE)

    logits = model(tensor)
    probs  = torch.softmax(logits, dim=1)[0].cpu().numpy()
    order  = np.argsort(probs)[::-1]

    print(f"\n---- PREDICTIONS: {Path(image_path).name} ----")
    for idx in order:
        print(f"  {CLASSES[idx]:<35} {probs[idx]:.4f}")

    best = order[0]
    print(f"\n  FINAL PREDICTION: {CLASSES[best]}  (confidence: {probs[best]:.4f})")
    return CLASSES[best], probs[best]


# ---------------------------------------------------------------------------
# Classify all cropped images
# ---------------------------------------------------------------------------
crop_files = sorted(OUTPUT_DIR.glob("*.JPG")) + sorted(OUTPUT_DIR.glob("*.jpg"))

if not crop_files:
    print("No cropped images found — check MegaDetector output and CONF_THRESH.")
else:
    print(f"\nClassifying {len(crop_files)} cropped images...\n")
    for crop_path in crop_files:
        classify_image(crop_path)