"""Exercise the packaged backend and resources on its target platform."""
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import time
from urllib.request import Request, urlopen

with tempfile.TemporaryDirectory() as temp:
    state = Path(temp)
    process = subprocess.Popen([sys.argv[1],"--serve",str(state)])
    try:
        for _ in range(150):
            if process.poll() is not None:
                raise RuntimeError(f"Packaged service exited: {process.returncode}")
            if (state/"endpoint.json").exists():
                break
            time.sleep(.2)
        endpoint = json.loads((state/"endpoint.json").read_text())
        url = f"http://127.0.0.1:{endpoint['port']}/"
        assert b'src="live.js"' in urlopen(url,timeout=10).read()
        assert b"pickIntroStyle" in urlopen(url+"app.js",timeout=10).read()
        request = Request(url+"api/state",headers={"X-AllChat":endpoint["token"]})
        assert "ZCode" in json.load(urlopen(request,timeout=30))["agents"]
    finally:
        process.terminate()
        process.wait(timeout=15)
