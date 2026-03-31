FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir fastapi uvicorn pydantic httpx pytest pytest-asyncio pyyaml

COPY config.py /app/config.py
COPY database.py /app/database.py
COPY models.py /app/models.py
COPY routers/ /app/routers/
COPY main.py /app/main.py

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
