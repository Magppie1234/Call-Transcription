import os
import json
import subprocess
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles

app = FastAPI(title="Call Transcription Demo API")

BASE_DIR = Path(__file__).parent
ENV_PATH = BASE_DIR / ".env"
STATIC_DIR = BASE_DIR / "static"

# Load env variables lazily
def load_env():
    if ENV_PATH.exists():
        from dotenv import load_dotenv
        load_dotenv(ENV_PATH)
load_env()

# Utility to run a script and capture output
def run_script(script_name: str, *args: str) -> str:
    proc = subprocess.run(["python3", str(BASE_DIR / "scripts" / script_name), *args],
                          capture_output=True, text=True, cwd=BASE_DIR)
    if proc.returncode != 0:
        raise RuntimeError(f"{script_name} failed: {proc.stderr.strip()}")
    return proc.stdout

@app.get("/health")
async def health_check():
    return {"status": "ok"}

@app.post("/discover")
async def do_discover():
    try:
        out = run_script("discover_zoho.py")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return JSONResponse(content={"message": "Discovery complete", "output": out})

@app.post("/volume")
async def do_volume():
    try:
        out = run_script("measure_volume.py")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return JSONResponse(content={"message": "Volume measurement complete", "output": out})

@app.get("/calls/ping")
async def get_calls():
    # Simulate API fetching a small sample; simply return count from out/calls_sample.json
    sample_path = BASE_DIR / "out" / "calls_json"
    if not (BASE_DIR / "out" / "calls_sample.json").exists():
        raise HTTPException(status_code=404, detail="Calls sample not found – run /discover first")
    data = json.loads((BASE_DIR / "out" / "calls_sample.json").read_text())
    return {"count": len(data.get("data", [])), "sample": data.get("data", [])[:5]}

# Serve static files
if STATIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")
    @app.get("/")
    async def root():
        return FileResponse(str(STATIC_DIR / "index.html"))

# Entry point for uvicorn
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("call transcription.main:app", host="0.0.0.0", port=8000, reload=True)