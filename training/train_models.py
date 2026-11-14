"""Train the small models the city runs in the browser and export them as JSON.

    python training/train_models.py

* School  - handwritten digit recogniser (MLP 64-48-10) on scikit-learn's
            8x8 digits, augmented and passed through exactly the same
            preprocessing the web page applies to a finger-drawn digit.
* Hospital - emergency triage priority (multinomial logistic regression) on
            synthetic vital signs. Demo data only, not a medical tool.

Weights are plain JSON so the browser needs no ML library.
"""
import json
import os

import cv2
import numpy as np
from sklearn.datasets import load_digits
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, classification_report
from sklearn.model_selection import train_test_split
from sklearn.neural_network import MLPClassifier
from sklearn.preprocessing import StandardScaler

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "models")
rng = np.random.default_rng(0)


# ----------------------------------------------------------------- digits ---
def preprocess(canvas: np.ndarray) -> np.ndarray:
    """Same steps as js/modules/school.js: crop ink, pad to a square with a
    margin, area-resize to 8x8, scale to 0..16."""
    ys, xs = np.where(canvas > 20)
    if len(xs) == 0:
        return np.zeros(64)
    crop = canvas[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    h, w = crop.shape
    side = int(max(h, w) * 1.25) + 1
    sq = np.zeros((side, side), np.float32)
    sq[(side - h) // 2:(side - h) // 2 + h, (side - w) // 2:(side - w) // 2 + w] = crop
    small = cv2.resize(sq, (8, 8), interpolation=cv2.INTER_AREA)
    return (small / max(small.max(), 1e-6) * 16).ravel()


def augment(img8: np.ndarray, n: int):
    """8x8 digit -> n finger-drawing-like variants at 64x64, then preprocess."""
    big = cv2.resize(img8.reshape(8, 8).astype(np.float32) / 16, (64, 64), interpolation=cv2.INTER_CUBIC)
    big = np.clip(big, 0, 1)
    out = []
    for _ in range(n):
        ang = rng.uniform(-14, 14)
        sc = rng.uniform(0.8, 1.15)
        M = cv2.getRotationMatrix2D((32, 32), ang, sc)
        M[:, 2] += rng.uniform(-6, 6, 2)
        M[0, 1] += rng.uniform(-0.2, 0.2)  # shear
        w = cv2.warpAffine(big, M, (64, 64))
        k = int(rng.choice([1, 3, 5]))
        if k > 1:  # stroke thickness
            w = cv2.dilate(w, np.ones((k, k), np.uint8)) if rng.random() < 0.6 else cv2.erode(w, np.ones((k - 2 or 1, k - 2 or 1), np.uint8))
        w = (w > rng.uniform(0.3, 0.55)).astype(np.float32) * 255  # finger strokes are solid
        out.append(preprocess(w))
    return out


def train_digits():
    d = load_digits()
    Xtr_i, Xte_i, ytr, yte = train_test_split(d.data, d.target, test_size=0.2, random_state=0, stratify=d.target)
    Xtr, Ytr = [], []
    for x, y in zip(Xtr_i, ytr):
        for v in augment(x, 12):
            Xtr.append(v)
            Ytr.append(y)
    Xte = [augment(x, 1)[0] for x in Xte_i]
    clf = MLPClassifier(hidden_layer_sizes=(48,), alpha=1e-3, max_iter=300, random_state=0)
    clf.fit(np.array(Xtr) / 16, Ytr)
    acc = accuracy_score(yte, clf.predict(np.array(Xte) / 16))
    print(f"digits MLP: train={len(Xtr)} held-out acc (augmented test digits)={acc:.4f}")
    return {
        "type": "mlp", "input_scale": 1 / 16, "test_accuracy": round(float(acc), 4),
        "layers": [{"W": w.T.round(5).tolist(), "b": b.round(5).tolist()}
                   for w, b in zip(clf.coefs_, clf.intercepts_)],
    }


# ----------------------------------------------------------------- triage ---
FEATURES = ["age", "heart_rate", "systolic_bp", "spo2", "temperature", "resp_rate", "pain"]


def triage_label(p):
    """Synthetic rule, loosely inspired by 5-level ED triage scales (1 = most urgent)."""
    s = 0
    s += 3 if p["spo2"] < 88 else 2 if p["spo2"] < 92 else 0
    s += 3 if p["systolic_bp"] < 85 else 1 if p["systolic_bp"] > 180 else 0
    s += 2 if p["heart_rate"] > 130 or p["heart_rate"] < 45 else 1 if p["heart_rate"] > 110 else 0
    s += 2 if p["resp_rate"] > 28 or p["resp_rate"] < 9 else 1 if p["resp_rate"] > 22 else 0
    s += 1 if p["temperature"] > 39.3 or p["temperature"] < 35 else 0
    s += 1 if p["pain"] >= 8 else 0
    s += 1 if p["age"] > 75 else 0
    return 1 if s >= 6 else 2 if s >= 4 else 3 if s >= 2 else 4 if s >= 1 else 5


def synth_patients(n):
    rows, ys = [], []
    for _ in range(n):
        sick = rng.random() < 0.35
        p = {
            "age": float(np.clip(rng.normal(45, 20), 1, 99)),
            "heart_rate": float(rng.normal(115 if sick else 82, 22 if sick else 12)),
            "systolic_bp": float(rng.normal(105 if sick else 125, 28 if sick else 15)),
            "spo2": float(np.clip(rng.normal(91 if sick else 97.5, 4 if sick else 1.2), 70, 100)),
            "temperature": float(rng.normal(38.2 if sick else 36.9, 1.0 if sick else 0.4)),
            "resp_rate": float(rng.normal(24 if sick else 16, 6 if sick else 2.5)),
            "pain": float(np.clip(rng.normal(6 if sick else 3, 2.5), 0, 10)),
        }
        rows.append([p[f] for f in FEATURES])
        ys.append(triage_label(p))
    return np.array(rows), np.array(ys)


def train_triage():
    X, y = synth_patients(12000)
    Xtr, Xte, ytr, yte = train_test_split(X, y, test_size=0.2, random_state=0, stratify=y)
    sc = StandardScaler().fit(Xtr)
    # quadratic terms let a linear model capture "too high OR too low"
    def expand(Z):
        Z = sc.transform(Z)
        return np.hstack([Z, Z ** 2])
    lr = LogisticRegression(max_iter=3000, C=3.0)
    lr.fit(expand(Xtr), ytr)
    pred = lr.predict(expand(Xte))
    acc = accuracy_score(yte, pred)
    within1 = float(np.mean(np.abs(pred - yte) <= 1))
    print(f"triage LR: acc={acc:.4f} within-one-level={within1:.4f}")
    print(classification_report(yte, pred, digits=3))
    return {
        "type": "logreg_quadratic", "features": FEATURES, "classes": lr.classes_.tolist(),
        "mean": sc.mean_.round(5).tolist(), "std": sc.scale_.round(5).tolist(),
        "W": lr.coef_.round(5).tolist(), "b": lr.intercept_.round(5).tolist(),
        "test_accuracy": round(float(acc), 4), "within_one_level": round(within1, 4),
    }


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    for name, fn in (("digits_mlp", train_digits), ("triage_lr", train_triage)):
        with open(os.path.join(OUT, f"{name}.json"), "w") as f:
            json.dump(fn(), f, separators=(",", ":"))
    print("saved to", OUT)
