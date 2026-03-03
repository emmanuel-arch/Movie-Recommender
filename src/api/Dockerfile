# ── API Dockerfile ────────────────────────────────────────
# Build context: repo root
#   docker build -f src/api/Dockerfile -t birgenai-api .
# ──────────────────────────────────────────────────────────
FROM python:3.11-slim

WORKDIR /app

# System deps for scikit-surprise (Cython / C compiler)
RUN apt-get update && \
    apt-get install -y --no-install-recommends gcc g++ && \
    rm -rf /var/lib/apt/lists/*

# Install Python deps (cached layer) — use API-specific requirements
COPY src/api/requirements.txt .
RUN pip install --no-cache-dir --upgrade pip setuptools wheel Cython && \
    pip install --no-cache-dir "numpy<2" && \
    pip install --no-cache-dir -r requirements.txt

# Copy data, model, and API source — preserve directory structure
# so Path(__file__).parent.parent.parent == /app
COPY data/movies.csv ./data/movies.csv
COPY src/api/           ./src/api/

EXPOSE 8000

# Run from src/api so `from recommender import Recommender` works
WORKDIR /app/src/api
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
