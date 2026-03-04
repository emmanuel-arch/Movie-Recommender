import os
import requests
from pathlib import Path

HF_BASE_URL = "https://huggingface.co/Birgen/birgenai-model-assets/resolve/main"

# Base directory = repo root (/app in Docker)
BASE_DIR = Path(__file__).parent.parent.parent

FILES = {
    BASE_DIR / "data/train.csv": f"{HF_BASE_URL}/train.csv",
    BASE_DIR / "models/svd_model.pkl": f"{HF_BASE_URL}/svd_model.pkl",
}

def download_file(url, destination):
    os.makedirs(os.path.dirname(destination), exist_ok=True)

    print(f"Downloading {destination}...")
    response = requests.get(url, stream=True)
    response.raise_for_status()

    with open(destination, "wb") as f:
        for chunk in response.iter_content(chunk_size=8192):
            f.write(chunk)
    print(f"✅ Downloaded {destination}")

def ensure_assets():
    for path, url in FILES.items():
        if not path.exists():
            download_file(url, path)
        else:
            print(f"{path} already exists.")

if __name__ == "__main__":
    ensure_assets()