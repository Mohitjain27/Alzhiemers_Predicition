"""
ML Model loader and predictor — Dual Model (VGG16 + ResNet50)
────────────────────────────────────────────────────────────────
MODELS:
  1. VGG16    → model/vgg16_alzheimer.pth
               Classifier: Linear(25088→4096) → Linear(4096→1024) → Linear(1024→4)

  2. ResNet50  → model/alzheimer_model.pth
               FC head: Dropout → Linear(2048→256) → ReLU → Dropout → Linear(256→4)

CLASSES: 4 (Mild / Moderate / No / Very Mild Impairment)
INPUT:   224×224 RGB, ImageNet-normalized
────────────────────────────────────────────────────────────────
predict(image_bytes, model_name='vgg16')
  model_name: 'vgg16' | 'resnet50' | 'ensemble'
"""

import numpy as np
from PIL import Image
import io
import os
import random
from typing import Optional

# ── Configuration ─────────────────────────────────────────────
USE_REAL_MODEL = True
IMAGE_SIZE = (224, 224)

# ImageNet normalization
IMAGENET_MEAN = [0.485, 0.456, 0.406]
IMAGENET_STD  = [0.229, 0.224, 0.225]

# MRI validation
CONFIDENCE_THRESHOLD = 45.0
MAX_COLOR_SATURATION = 40.0

# ── Class Labels ───────────────────────────────────────────────
# ORDER matches checkpoint class_to_idx exactly:
# {'Mild Impairment':0, 'Moderate Impairment':1, 'No Impairment':2, 'Very Mild Impairment':3}
CLASS_LABELS = [
    "Mild Impairment",       # index 0
    "Moderate Impairment",   # index 1
    "No Impairment",         # index 2
    "Very Mild Impairment",  # index 3
]
NUM_CLASSES = len(CLASS_LABELS)

STAGE_INFO = {
    "No Impairment": {
        "description": "No detectable signs of Alzheimer's disease. Brain structure appears normal for age. No intervention required.",
        "severity": "low",  "color": "#22c55e",
    },
    "Very Mild Impairment": {
        "description": "Very slight cognitive changes, mostly minor memory lapses. The patient is still largely independent and functional.",
        "severity": "medium", "color": "#eab308",
    },
    "Mild Impairment": {
        "description": "Noticeable memory and cognitive difficulties. Daily tasks may require occasional assistance. Medical consultation recommended.",
        "severity": "high", "color": "#f97316",
    },
    "Moderate Impairment": {
        "description": "Significant cognitive decline requiring daily assistance. Behavioral and personality changes are common. Immediate medical care advised.",
        "severity": "critical", "color": "#ef4444",
    },
}

# ── Global state ───────────────────────────────────────────────
MODEL_REGISTRY: dict = {}     # {'vgg16': model, 'resnet50': model}
_device = None


# ── Standalone PyTorch Architectures (Zero torchvision dependency) ───────────

def _build_resnet50():
    """Construct ResNet50 matching checkpoint without torchvision requirement."""
    import torch
    import torch.nn as nn

    class Bottleneck(nn.Module):
        expansion = 4
        def __init__(self, inplanes, planes, stride=1, downsample=None):
            super().__init__()
            self.conv1 = nn.Conv2d(inplanes, planes, kernel_size=1, bias=False)
            self.bn1 = nn.BatchNorm2d(planes)
            self.conv2 = nn.Conv2d(planes, planes, kernel_size=3, stride=stride, padding=1, bias=False)
            self.bn2 = nn.BatchNorm2d(planes)
            self.conv3 = nn.Conv2d(planes, planes * self.expansion, kernel_size=1, bias=False)
            self.bn3 = nn.BatchNorm2d(planes * self.expansion)
            self.relu = nn.ReLU(inplace=True)
            self.downsample = downsample

        def forward(self, x):
            identity = x
            out = self.relu(self.bn1(self.conv1(x)))
            out = self.relu(self.bn2(self.conv2(out)))
            out = self.bn3(self.conv3(out))
            if self.downsample is not None:
                identity = self.downsample(x)
            out += identity
            return self.relu(out)

    class ResNet(nn.Module):
        def __init__(self, block, layers, num_classes=4):
            super().__init__()
            self.inplanes = 64
            self.conv1 = nn.Conv2d(3, 64, kernel_size=7, stride=2, padding=3, bias=False)
            self.bn1 = nn.BatchNorm2d(64)
            self.relu = nn.ReLU(inplace=True)
            self.maxpool = nn.MaxPool2d(kernel_size=3, stride=2, padding=1)
            self.layer1 = self._make_layer(block, 64, layers[0])
            self.layer2 = self._make_layer(block, 128, layers[1], stride=2)
            self.layer3 = self._make_layer(block, 256, layers[2], stride=2)
            self.layer4 = self._make_layer(block, 512, layers[3], stride=2)
            self.avgpool = nn.AdaptiveAvgPool2d((1, 1))
            self.fc = nn.Sequential(
                nn.Dropout(p=0.5),
                nn.Linear(2048, 256),
                nn.ReLU(inplace=True),
                nn.Dropout(p=0.3),
                nn.Linear(256, num_classes)
            )

        def _make_layer(self, block, planes, blocks, stride=1):
            downsample = None
            if stride != 1 or self.inplanes != planes * block.expansion:
                downsample = nn.Sequential(
                    nn.Conv2d(self.inplanes, planes * block.expansion, kernel_size=1, stride=stride, bias=False),
                    nn.BatchNorm2d(planes * block.expansion),
                )
            layers = [block(self.inplanes, planes, stride, downsample)]
            self.inplanes = planes * block.expansion
            for _ in range(1, blocks):
                layers.append(block(self.inplanes, planes))
            return nn.Sequential(*layers)

        def forward(self, x):
            x = self.relu(self.bn1(self.conv1(x)))
            x = self.maxpool(x)
            x = self.layer1(x)
            x = self.layer2(x)
            x = self.layer3(x)
            x = self.layer4(x)
            x = self.avgpool(x)
            x = torch.flatten(x, 1)
            return self.fc(x)

    return ResNet(Bottleneck, [3, 4, 6, 3], num_classes=NUM_CLASSES)


def _build_vgg16():
    """Construct VGG16 matching checkpoint without torchvision requirement."""
    import torch
    import torch.nn as nn

    cfg = [64, 64, 'M', 128, 128, 'M', 256, 256, 256, 'M', 512, 512, 512, 'M', 512, 512, 512, 'M']
    layers = []
    in_channels = 3
    for v in cfg:
        if v == 'M':
            layers += [nn.MaxPool2d(kernel_size=2, stride=2)]
        else:
            conv2d = nn.Conv2d(in_channels, v, kernel_size=3, padding=1)
            layers += [conv2d, nn.ReLU(inplace=True)]
            in_channels = v
    features = nn.Sequential(*layers)
    classifier = nn.Sequential(
        nn.Linear(512 * 7 * 7, 4096),
        nn.ReLU(True),
        nn.Dropout(p=0.5),
        nn.Linear(4096, 1024),
        nn.ReLU(True),
        nn.Dropout(p=0.5),
        nn.Linear(1024, NUM_CLASSES),
    )

    class VGG(nn.Module):
        def __init__(self, f, c):
            super().__init__()
            self.features = f
            self.avgpool = nn.AdaptiveAvgPool2d((7, 7))
            self.classifier = c

        def forward(self, x):
            x = self.features(x)
            x = self.avgpool(x)
            x = torch.flatten(x, 1)
            x = self.classifier(x)
            return x

    return VGG(features, classifier)


def _find_checkpoint(name: str) -> Optional[str]:
    """Look for checkpoint in model/ or downloads folder."""
    base_dir = os.path.dirname(os.path.abspath(__file__))
    model_dir = os.path.normpath(os.path.join(base_dir, "..", "model"))
    candidates = []
    if name == "resnet50":
        candidates = [
            os.path.join(model_dir, "alzheimer_model.pth"),
            os.path.join(model_dir, "resnet50_alzheimer.pth"),
            "/Users/mohitjain/Downloads/Trained things/resnet50_alzheimer.pth",
        ]
    elif name == "vgg16":
        candidates = [
            os.path.join(model_dir, "vgg16_alzheimer.pth"),
            "/Users/mohitjain/Downloads/Trained things/vgg16_alzheimer.pth",
        ]

    for p in candidates:
        if os.path.exists(p):
            return p
    return None


def _load_single(name: str, builder_fn, device) -> bool:
    """Load one model checkpoint into MODEL_REGISTRY. Returns True on success."""
    import torch
    ckpt_path = _find_checkpoint(name)
    if not ckpt_path:
        print(f"⚠️  [{name}] Checkpoint file not found.")
        return False

    try:
        model = builder_fn()
        checkpoint = torch.load(ckpt_path, map_location=device)

        if 'class_to_idx' in checkpoint:
            saved = checkpoint['class_to_idx']
            idx_to_cls = {v: k for k, v in saved.items()}
            print(f"📋 [{name}] Class mapping:")
            for idx in sorted(idx_to_cls):
                expected = CLASS_LABELS[idx] if idx < len(CLASS_LABELS) else '???'
                ok = '✅' if idx_to_cls[idx] == expected else '❌ MISMATCH'
                print(f"   [{idx}] {idx_to_cls[idx]}  {ok}")

        state = checkpoint.get('model_state_dict',
                checkpoint.get('state_dict', checkpoint))
        model.load_state_dict(state)
        model.to(device)
        model.eval()
        MODEL_REGISTRY[name] = model
        print(f"✅ [{name}] Loaded from {ckpt_path}")
        return True
    except Exception as e:
        print(f"❌ [{name}] Failed to load: {e}")
        return False


def load_model():
    """Called once at app startup — loads both VGG16 and ResNet50."""
    global _device

    if not USE_REAL_MODEL:
        print("ℹ️  ML Models: Running in MOCK mode.")
        return

    try:
        import torch
        _device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        print(f"🖥️  Using device: {_device}")

        _load_single("vgg16",    _build_vgg16,    _device)
        _load_single("resnet50", _build_resnet50, _device)

        loaded = list(MODEL_REGISTRY.keys())
        print(f"✅ Models ready: {loaded}")
    except Exception as e:
        print(f"⚠️  Error during real model loading: {e}. Falling back to mock if needed.")


def validate_mri_image(image_bytes: bytes) -> None:
    """
    Validate that the uploaded image looks like a grayscale brain MRI.
    Raises ValueError with a user-friendly message if validation fails.
    """
    try:
        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    except Exception:
        raise ValueError("Could not read the uploaded file as an image.")

    arr = np.array(image, dtype=np.float32)
    r, g, b = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2]
    ch_max = np.stack([r, g, b], axis=-1).max(axis=-1)
    ch_min = np.stack([r, g, b], axis=-1).min(axis=-1)
    sat = float(np.mean(ch_max - ch_min))

    if sat > MAX_COLOR_SATURATION:
        raise ValueError(
            "The uploaded image does not appear to be a brain MRI scan. "
            "Please upload a valid axial brain MRI image."
        )


def preprocess_image(image_bytes: bytes) -> "np.ndarray":
    """Convert raw bytes → ImageNet-normalised NCHW numpy array."""
    image = Image.open(io.BytesIO(image_bytes)).convert("RGB").resize(IMAGE_SIZE)
    arr = np.array(image, dtype=np.float32) / 255.0
    mean = np.array(IMAGENET_MEAN, dtype=np.float32)
    std  = np.array(IMAGENET_STD,  dtype=np.float32)
    arr  = (arr - mean) / std
    arr  = np.transpose(arr, (2, 0, 1))   # HWC → CHW
    arr  = np.expand_dims(arr, axis=0)    # → NCHW
    return arr


def _run_single_model(model, arr, device) -> tuple:
    """Run one model; return (class_idx, confidence_pct, probs_list)."""
    import torch
    tensor = torch.FloatTensor(arr).to(device)
    with torch.no_grad():
        out   = model(tensor)
        probs = torch.softmax(out, dim=1)
        idx   = int(torch.argmax(probs, dim=1).item())
        conf  = float(probs[0, idx].item()) * 100
        return idx, conf, probs[0].tolist()


def predict(image_bytes: bytes, model_name: str = "vgg16") -> dict:
    """
    Run prediction with the selected model.
    model_name: 'vgg16' | 'resnet50' | 'ensemble'

    Returns a dict with at minimum:
      diagnosis, confidence, stage_description, severity_level, model_used
    For 'ensemble' also includes: vgg16_result, resnet50_result
    """
    arr = preprocess_image(image_bytes)

    # ── MOCK mode fallback ─────────────────────────────────────
    if not MODEL_REGISTRY:
        weights  = [0.25, 0.25, 0.25, 0.25]
        idx      = random.choices(range(4), weights=weights, k=1)[0]
        conf     = round(random.uniform(75.0, 98.5), 2)
        label    = CLASS_LABELS[idx]
        info     = STAGE_INFO[label]
        return {
            "diagnosis":         label,
            "confidence":        conf,
            "stage_description": info["description"],
            "severity_level":    info["severity"],
            "model_used":        f"{model_name.upper()} (mock)",
        }

    # ── ENSEMBLE mode ──────────────────────────────────────────
    if model_name == "ensemble":
        results = {}
        probs_all = []
        for name in ("vgg16", "resnet50"):
            if name not in MODEL_REGISTRY:
                continue
            idx, conf, probs = _run_single_model(MODEL_REGISTRY[name], arr, _device)
            results[name] = {
                "diagnosis":  CLASS_LABELS[idx],
                "confidence": round(conf, 2),
            }
            probs_all.append(probs)

        if not probs_all:
            raise ValueError("No models available for ensemble prediction.")

        # Average probabilities across both models
        avg_probs = [sum(p[i] for p in probs_all) / len(probs_all) for i in range(NUM_CLASSES)]
        ens_idx   = int(max(range(NUM_CLASSES), key=lambda i: avg_probs[i]))
        ens_conf  = avg_probs[ens_idx] * 100
        label     = CLASS_LABELS[ens_idx]
        info      = STAGE_INFO[label]

        if ens_conf < CONFIDENCE_THRESHOLD:
            raise ValueError(
                f"The model could not confidently classify this image "
                f"(confidence: {ens_conf:.1f}%). Please upload a valid brain MRI."
            )

        return {
            "diagnosis":         label,
            "confidence":        round(ens_conf, 2),
            "stage_description": info["description"],
            "severity_level":    info["severity"],
            "model_used":        "Ensemble (VGG16 + ResNet50)",
            "vgg16_result":      results.get("vgg16"),
            "resnet50_result":   results.get("resnet50"),
        }

    # ── SINGLE MODEL mode ──────────────────────────────────────
    if model_name not in MODEL_REGISTRY:
        # Fall back to any loaded model if the requested one is not present
        model_name = next(iter(MODEL_REGISTRY.keys()))

    # Run primary model
    idx, conf, primary_probs = _run_single_model(MODEL_REGISTRY[model_name], arr, _device)
    primary_result = {
        "diagnosis":  CLASS_LABELS[idx],
        "confidence": round(conf, 2),
    }

    if conf < CONFIDENCE_THRESHOLD:
        raise ValueError(
            f"The model could not confidently classify this image "
            f"(confidence: {conf:.1f}%). Please upload a valid brain MRI."
        )

    final_label = primary_result["diagnosis"]
    final_conf  = primary_result["confidence"]
    final_info  = STAGE_INFO[final_label]

    return {
        "diagnosis":         final_label,
        "confidence":        round(final_conf, 2),
        "stage_description": final_info["description"],
        "severity_level":    final_info["severity"],
        "model_used":        model_name.upper(),
        "vgg16_result":      None,
        "resnet50_result":   None,
    }


def available_models() -> list:
    """Return list of loaded model names."""
    return list(MODEL_REGISTRY.keys())


# ── Metrics ────────────────────────────────────────────────────
MOCK_METRICS = {
    "accuracy": 99.0,
    "confusion_matrix": [
        [640,   2,   0,   0],
        [  3, 638,   1,   0],
        [  0,   2, 638,   2],
        [  0,   0,   3, 639],
    ],
    "classification_report": {
        "No Impairment":        {"precision": 0.995, "recall": 0.997, "f1-score": 0.996, "support": 642},
        "Very Mild Impairment": {"precision": 0.994, "recall": 0.994, "f1-score": 0.994, "support": 642},
        "Mild Impairment":      {"precision": 0.994, "recall": 0.994, "f1-score": 0.994, "support": 642},
        "Moderate Impairment":  {"precision": 0.997, "recall": 0.995, "f1-score": 0.996, "support": 642},
    },
    "class_labels": CLASS_LABELS,
}
