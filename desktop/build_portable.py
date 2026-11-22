"""Build the native bundle on the target OS."""
from pathlib import Path
import sys

from PIL import Image
import PyInstaller.__main__

root = Path(__file__).resolve().parents[1]
mac = sys.platform == "darwin"
build = root/"build"/"portable"
build.mkdir(parents=True,exist_ok=True)
icon = build/("allchat.icns" if mac else "allchat.ico")
Image.open(root/"desktop/icon.png").save(icon)
args = ["--noconfirm","--clean","--onedir","--windowed","--name","AllChat","--icon",str(icon),
        "--paths",str(root),"--specpath",str(build),"--workpath",str(build/"work"),"--distpath",str(root/"dist"),
        ]
if mac:
    args.extend(["--osx-bundle-identifier","io.github.chenmochaos.AllChat"])
for asset in ("assets","index.html","styles.css","app.js","live.js","ui.js"):
    args.extend(["--add-data",f"{root/asset}:{'assets' if asset=='assets' else '.'}"])
PyInstaller.__main__.run(args+[str(root/"desktop/portable.py")])
