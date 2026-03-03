import os
import requests

HF_BASE_URL = "https://huggingface.co/Birgen/birgenai-model-assets/resolve/main"

FILES = {
    "data/train.csv": f"{HF_BASE_URL}/train.csv",
    "models/svd_model.pkl": f"{HF_BASE_URL}/svd_model.pkl",
}

def download_file(url, destination):
    os.makedirs(os.path.dirname(destination), exist_ok=True)

    print(f"Downloading {destination}...")
    response = requests.get(url)
    response.raise_for_status()

    with open(destination, "wb") as f:
        f.write(response.content)

def ensure_assets():
    for path, url in FILES.items():
        if not os.path.exists(path):
            download_file(url, path)
        else:
            print(f"{path} already exists.")