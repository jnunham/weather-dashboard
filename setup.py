#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2026 Weather Dashboard contributors
#
# This program is free software: you can redistribute it and/or modify it
# under the terms of the GNU General Public License as published by the
# Free Software Foundation, either version 3 of the License, or (at your
# option) any later version. See the LICENSE file for the full text.
#
# This program is distributed WITHOUT ANY WARRANTY and is not a certified
# life-safety system — during severe weather, always follow official
# guidance from the National Weather Service and local emergency
# management, not this app.

"""One-shot install-and-run for the whole app.

  python3 setup.py

Installs Node.js if it's missing (Linux via apt/dnf/pacman, macOS via
Homebrew, Windows via winget), sets up the backend virtualenv, npm-installs
the frontend, then starts both dev servers and opens your browser.

Pass --setup-only to install everything without starting the servers.

  python3 setup.py --lan          serve the built app to your whole network
  python3 setup.py --pi-display   (Raspberry Pi) turn this machine into a
                                  dedicated, boot-to-kiosk weather display

--pi-display installs a systemd service for the server, a launcher that opens
Chromium full-screen in the compact small-screen layout on boot, and (where
raspi-config exists) turns on desktop auto-login and turns off screen
blanking. It's the only thing that enables the compact layout (it adds
compact=1 to the kiosk URL), so normal installs are unaffected.
"""

import argparse
import getpass
import os
import platform
import shutil
import socket
import subprocess
import sys
import time
import venv
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent
BACKEND = ROOT / "backend"
FRONTEND = ROOT / "frontend"
VENV_DIR = BACKEND / ".venv"

IS_WINDOWS = sys.platform == "win32"
VENV_PYTHON = VENV_DIR / ("Scripts/python.exe" if IS_WINDOWS else "bin/python")

BACKEND_URL = "http://localhost:8000"
FRONTEND_URL = "http://localhost:5173"


def get_lan_ip():
    """Best-effort LAN IP for printing a URL other devices can actually use.
    Opens no real connection — UDP has no handshake, so connect() here just
    asks the OS which local interface/IP would be used to reach that address."""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("8.8.8.8", 80))
            return s.getsockname()[0]
    except OSError:
        return None


def run(cmd, cwd=None):
    print(f"$ {' '.join(str(c) for c in cmd)}")
    subprocess.run(cmd, cwd=cwd, check=True)


def ensure_env_file(directory: Path):
    example = directory / ".env.example"
    target = directory / ".env"
    if example.exists() and not target.exists():
        shutil.copyfile(example, target)
        print(f"Created {target.relative_to(ROOT)} from .env.example")


# Vite 5 / Rollup (the frontend build) need Node 18+. Distro packages are often
# far older — Raspberry Pi OS "Bullseye" and Ubuntu 20.04/22.04 ship Node
# 10-12 — and fail with confusing errors deep inside `vite build`, so check
# the version up front instead of just checking that some `node` exists.
MIN_NODE_MAJOR = 18
# 20, not newer, on purpose: Node 22+'s official Linux builds need a newer
# libstdc++ than Debian 11 / Raspberry Pi OS Bullseye has.
NODE_INSTALL_MAJOR = 20
LOCAL_NODE_DIR = Path.home() / ".local" / "node"


def use_local_node():
    """Put a Node installed by this script (see install_node_from_nodejs_org)
    ahead of the system one on PATH, so re-runs find it without a new shell."""
    bin_dir = LOCAL_NODE_DIR / "bin"
    path = os.environ.get("PATH", "")
    if (bin_dir / "node").exists() and str(bin_dir) not in path.split(os.pathsep):
        os.environ["PATH"] = str(bin_dir) + os.pathsep + path


def node_major():
    """Major version of the `node` on PATH, or None if absent/unrunnable."""
    node = shutil.which("node")
    if not node:
        return None
    try:
        out = subprocess.run([node, "--version"], capture_output=True, text=True, check=True).stdout
        return int(out.strip().lstrip("v").split(".")[0])
    except (OSError, ValueError, subprocess.CalledProcessError):
        return None


def have_node():
    use_local_node()
    major = node_major()
    return shutil.which("npm") is not None and major is not None and major >= MIN_NODE_MAJOR


def install_node_from_nodejs_org():
    """Linux: download the official Node.js build for this CPU, check it
    against nodejs.org's published SHA-256, and unpack it into ~/.local/node
    (no root needed, and it doesn't touch the distro's own — older — Node).
    Returns True if a working node is on PATH afterward."""
    import hashlib
    import struct
    import tarfile
    import tempfile
    import urllib.request

    arch = {"x86_64": "x64", "amd64": "x64", "aarch64": "arm64", "arm64": "arm64", "armv7l": "armv7l"}.get(
        platform.machine().lower()
    )
    # A 64-bit kernel under a 32-bit userland (some Pi setups) reports
    # aarch64, but only a 32-bit Node will actually run there.
    if arch == "arm64" and struct.calcsize("P") == 4:
        arch = "armv7l"
    if not arch:
        print(f"No official Node.js build for this CPU ({platform.machine()}).")
        return False

    base = f"https://nodejs.org/dist/latest-v{NODE_INSTALL_MAJOR}.x"
    try:
        shasums = urllib.request.urlopen(f"{base}/SHASUMS256.txt", timeout=30).read().decode()
        wanted = None
        for line in shasums.splitlines():
            digest, _, name = line.partition("  ")
            if name.endswith(f"-linux-{arch}.tar.xz"):
                wanted = (digest, name)
        if not wanted:
            print(f"nodejs.org lists no Node {NODE_INSTALL_MAJOR} build for linux-{arch}.")
            return False
        expected_sha, filename = wanted

        print(f"Downloading {filename} from nodejs.org ...")
        with tempfile.TemporaryDirectory() as tmp:
            archive = Path(tmp) / filename
            sha = hashlib.sha256()
            with urllib.request.urlopen(f"{base}/{filename}", timeout=60) as resp, open(archive, "wb") as out:
                while True:
                    chunk = resp.read(1 << 20)
                    if not chunk:
                        break
                    sha.update(chunk)
                    out.write(chunk)
            if sha.hexdigest() != expected_sha:
                print("Download failed its checksum check — not installing it.")
                return False

            staging = Path(tmp) / "unpacked"
            with tarfile.open(archive, "r:xz") as tar:
                # Source and checksum are both nodejs.org over HTTPS, but
                # still refuse anything that would unpack outside staging.
                root = os.path.realpath(staging)
                for member in tar.getmembers():
                    target = os.path.realpath(os.path.join(root, member.name))
                    if os.path.commonpath([root, target]) != root:
                        print(f"Unexpected path in archive ({member.name}) — not installing it.")
                        return False
                tar.extractall(staging)

            unpacked = next(staging.iterdir())
            if LOCAL_NODE_DIR.exists():
                shutil.rmtree(LOCAL_NODE_DIR)
            LOCAL_NODE_DIR.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(unpacked), str(LOCAL_NODE_DIR))
    except (OSError, tarfile.TarError) as exc:
        print(f"Couldn't install Node.js from nodejs.org: {exc}")
        return False

    use_local_node()
    if have_node():
        print(f"Installed Node.js {node_major()} to {LOCAL_NODE_DIR}")
        return True
    print("Downloaded Node.js but it won't run on this system.")
    return False


def install_node():
    """Best-effort automatic Node.js install. Returns True if a new-enough
    node + npm are on PATH afterward (freshly installed or already present)."""

    if have_node():
        return True

    existing = node_major()
    if existing is not None:
        print(f"Node.js {existing} is too old (the frontend build needs {MIN_NODE_MAJOR}+) — installing a current one...")
    else:
        print("Node.js/npm not found — installing it automatically...")
    system = platform.system()

    # On Linux the distro's package is the one most likely to be too old, so
    # go to nodejs.org first and only fall back to the package manager.
    if system == "Linux" and install_node_from_nodejs_org():
        return True

    try:
        if system == "Linux":
            if shutil.which("apt-get"):
                run(["sudo", "apt-get", "update"])
                run(["sudo", "apt-get", "install", "-y", "nodejs", "npm"])
            elif shutil.which("dnf"):
                run(["sudo", "dnf", "install", "-y", "nodejs", "npm"])
            elif shutil.which("pacman"):
                run(["sudo", "pacman", "-Sy", "--noconfirm", "nodejs", "npm"])
            else:
                print("No supported package manager found (apt/dnf/pacman). Install Node.js manually: https://nodejs.org")
                return False
        elif system == "Darwin":
            if shutil.which("brew"):
                run(["brew", "install", "node"])
            else:
                print("Homebrew not found. Install it from https://brew.sh, or install Node.js manually: https://nodejs.org")
                return False
        elif system == "Windows":
            if shutil.which("winget"):
                run(["winget", "install", "-e", "--id", "OpenJS.NodeJS.LTS"])
            else:
                print("winget not found. Install Node.js manually: https://nodejs.org")
                return False
        else:
            print(f"Unrecognized platform '{system}'. Install Node.js manually: https://nodejs.org")
            return False
    except subprocess.CalledProcessError:
        print("Automatic Node.js install failed. Install it manually (https://nodejs.org) and re-run this script.")
        return False

    if have_node():
        print("Node.js installed.")
        return True

    print(f"A Node.js {MIN_NODE_MAJOR}+ still isn't available — you may need to open a new terminal, then re-run this script,")
    print("or install it manually: https://nodejs.org")
    return False


def setup_backend():
    print("\n=== Backend (Python) ===")
    if not VENV_DIR.exists():
        print(f"Creating virtualenv at {VENV_DIR.relative_to(ROOT)}")
        venv.EnvBuilder(with_pip=True).create(VENV_DIR)
    else:
        print("Virtualenv already exists, reusing it")

    run([str(VENV_PYTHON), "-m", "pip", "install", "--upgrade", "pip"])
    run([str(VENV_PYTHON), "-m", "pip", "install", "-r", str(BACKEND / "requirements.txt")])
    ensure_env_file(BACKEND)


def setup_frontend():
    print("\n=== Frontend (npm) ===")
    if not install_node():
        return False
    run([shutil.which("npm"), "install"], cwd=FRONTEND)
    ensure_env_file(FRONTEND)
    return True


def run_dev_servers():
    """Two separate processes with hot-reload — best for active development
    on this one machine. Localhost only; see run_combined_server for LAN use."""
    print("\n=== Starting dev servers ===")
    backend_proc = subprocess.Popen(
        [
            str(VENV_PYTHON), "-m", "uvicorn", "app.main:app",
            "--reload", "--app-dir", str(BACKEND), "--host", "127.0.0.1", "--port", "8000",
        ],
        cwd=ROOT,
    )
    frontend_proc = subprocess.Popen([shutil.which("npm"), "run", "dev"], cwd=FRONTEND)

    print(f"\nBackend:  {BACKEND_URL}")
    print(f"Frontend: {FRONTEND_URL}")
    print("\n(Localhost only — for other devices on your network, use --lan instead.)")
    print("\nPress Ctrl+C to stop both.\n")

    time.sleep(2)
    try:
        webbrowser.open(FRONTEND_URL)
    except Exception:
        pass

    try:
        while backend_proc.poll() is None and frontend_proc.poll() is None:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\nStopping...")
    finally:
        for proc in (backend_proc, frontend_proc):
            if proc.poll() is None:
                proc.terminate()
        for proc in (backend_proc, frontend_proc):
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()


def build_frontend():
    print("\n=== Building frontend ===")
    # Vite bakes VITE_-prefixed env vars into the build at *build time* — if
    # frontend/.env has a leftover VITE_API_BASE_URL from before --lan mode
    # existed (e.g. a hardcoded "http://localhost:8000"), it would silently
    # override the app's own same-origin default and get compiled into the
    # bundle permanently, sending every device's requests to the wrong host.
    # Force it blank for this build specifically so --lan always gets the
    # correct same-origin behavior regardless of what's sitting in .env.
    env = {**os.environ, "VITE_API_BASE_URL": ""}
    print("$ npm run build   (VITE_API_BASE_URL forced blank for this build)")
    subprocess.run([shutil.which("npm"), "run", "build"], cwd=FRONTEND, check=True, env=env)


def run_combined_server(port):
    """One process, one port: the backend serves the built frontend itself
    (see main.py's StaticFiles mount) — no CORS, no separate frontend
    process, and (the point of using port 80/8080 instead of 5173/8000)
    ordinary web ports that networks and browsers treat as unremarkable,
    unlike the two "developer" ports some routers/security software single
    out for extra scrutiny."""
    print(f"\n=== Starting server on port {port} ===")
    proc = subprocess.Popen(
        [str(VENV_PYTHON), "-m", "uvicorn", "app.main:app", "--app-dir", str(BACKEND), "--host", "0.0.0.0", "--port", str(port)],
        cwd=ROOT,
    )

    time.sleep(2)
    if proc.poll() is not None:
        # Exited already — on Linux/macOS this is almost always permission
        # denied for a port under 1024, which needs elevated privileges to
        # bind. Full output is above (not captured, so you can see the real
        # error). Fall back to 8080, which needs no special privileges.
        if port < 1024:
            print(f"\nCouldn't bind port {port} (see the error above — on Linux/macOS this usually means it needs elevated privileges).")
            print(f"Falling back to port 8080 for now.")
            if not IS_WINDOWS:
                print(f"To use port {port} without sudo in the future, run this once:")
                print(f"  sudo setcap 'cap_net_bind_service=+ep' {VENV_PYTHON}")
            print()
            return run_combined_server(8080)
        print("\nServer exited immediately — see the error above.")
        sys.exit(1)

    port_suffix = "" if port == 80 else f":{port}"
    url = f"http://localhost{port_suffix}"
    print(f"\nOpen: {url}")
    lan_ip = get_lan_ip()
    if lan_ip:
        print(f"From another device on your network: http://{lan_ip}{port_suffix}")
    print("\nPress Ctrl+C to stop.\n")

    try:
        webbrowser.open(url)
    except Exception:
        pass

    try:
        proc.wait()
    except KeyboardInterrupt:
        print("\nStopping...")
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()


PI_SERVICE_NAME = "weather-dashboard"
PI_SERVICE_PATH = f"/etc/systemd/system/{PI_SERVICE_NAME}.service"
PI_PORT = 80


def render_pi_display_files(kiosk_script_path):
    """The three files --pi-display installs, as text (kept separate from the
    installing so the contents can be inspected/tested without touching the
    system). Returns (systemd unit, kiosk launcher script, autostart entry)."""
    health_url = f"http://localhost:{PI_PORT}/api/health"
    kiosk_url = f"http://localhost:{PI_PORT}/?kiosk=1&compact=1"

    # Port 80 without running as root: AmbientCapabilities grants just the
    # one privilege needed to bind it, so the app itself runs as a normal user.
    unit = f"""[Unit]
Description=Weather Dashboard
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User={getpass.getuser()}
WorkingDirectory={ROOT}
ExecStart="{VENV_PYTHON}" -m uvicorn app.main:app --app-dir "{BACKEND}" --host 0.0.0.0 --port {PI_PORT}
Restart=always
RestartSec=5
AmbientCapabilities=CAP_NET_BIND_SERVICE

[Install]
WantedBy=multi-user.target
"""

    kiosk_script = f"""#!/bin/sh
# Generated by setup.py --pi-display — re-running that overwrites this file.

# The server is started by systemd at boot, usually ahead of the desktop but
# not guaranteed to be — wait for it (up to ~90s) so the browser doesn't open
# onto a connection error and sit there.
i=0
until "{VENV_PYTHON}" -c "import urllib.request; urllib.request.urlopen('{health_url}', timeout=2)" >/dev/null 2>&1; do
  i=$((i + 1))
  [ "$i" -gt 90 ] && break
  sleep 1
done

# Keep the screen on (these only do anything under X11; Wayland's setting is
# handled by raspi-config during setup).
xset s off 2>/dev/null
xset -dpms 2>/dev/null
xset s noblank 2>/dev/null

# After a power cut Chromium thinks it crashed and offers to restore the
# previous session — mark the last exit as clean so it just opens normally.
PREFS="$HOME/.config/chromium/Default/Preferences"
if [ -f "$PREFS" ]; then
  sed -i 's/"exited_cleanly":false/"exited_cleanly":true/; s/"exit_type":"Crashed"/"exit_type":"Normal"/' "$PREFS"
fi

BROWSER=$(command -v chromium-browser || command -v chromium)
if [ -z "$BROWSER" ]; then
  echo "Chromium not found — install it (sudo apt install chromium-browser)" >&2
  exit 1
fi

exec "$BROWSER" --kiosk --noerrdialogs --disable-infobars --disable-session-crashed-bubble --disable-pinch --overscroll-history-navigation=0 "{kiosk_url}"
"""

    desktop_entry = f"""[Desktop Entry]
Type=Application
Name=Weather Dashboard Kiosk
Comment=Full-screen weather dashboard
Exec="{kiosk_script_path}"
X-GNOME-Autostart-enabled=true
"""
    return unit, kiosk_script, desktop_entry


def _as_root(cmd):
    """Prefix a command with sudo unless we're already root."""
    return cmd if os.geteuid() == 0 else ["sudo", *cmd]


def _wait_for_health(url, timeout=30):
    import urllib.request

    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            urllib.request.urlopen(url, timeout=2).read()
            return True
        except Exception:
            time.sleep(1)
    return False


def install_pi_display():
    """Turn this machine into a dedicated, boot-to-kiosk weather display:
    server as a systemd service, Chromium launched full-screen at the
    compact small-screen layout on desktop login."""
    print("\n=== Setting up this machine as a dedicated display ===")

    kiosk_dir = Path.home() / ".config" / "weather-dashboard"
    kiosk_script_path = kiosk_dir / "kiosk.sh"
    autostart_path = Path.home() / ".config" / "autostart" / "weather-dashboard-kiosk.desktop"
    unit, kiosk_script, desktop_entry = render_pi_display_files(kiosk_script_path)

    # Per-user files (browser launcher + autostart entry).
    kiosk_dir.mkdir(parents=True, exist_ok=True)
    kiosk_script_path.write_text(kiosk_script, encoding="utf-8")
    kiosk_script_path.chmod(0o755)
    autostart_path.parent.mkdir(parents=True, exist_ok=True)
    autostart_path.write_text(desktop_entry, encoding="utf-8")
    print(f"Wrote {kiosk_script_path}")
    print(f"Wrote {autostart_path}")

    # System service (needs root).
    print(f"\nInstalling the {PI_SERVICE_NAME} service (may ask for your sudo password)...")
    subprocess.run(_as_root(["tee", PI_SERVICE_PATH]), input=unit, text=True, stdout=subprocess.DEVNULL, check=True)
    subprocess.run(_as_root(["systemctl", "daemon-reload"]), check=True)
    subprocess.run(_as_root(["systemctl", "enable", f"{PI_SERVICE_NAME}.service"]), check=True)
    # restart (not start) so re-running this after a git pull picks up changes.
    subprocess.run(_as_root(["systemctl", "restart", f"{PI_SERVICE_NAME}.service"]), check=True)

    print("Waiting for the server to come up...")
    healthy = _wait_for_health(f"http://localhost:{PI_PORT}/api/health")
    print("Server is up." if healthy else
          f"WARNING: the server didn't respond. Check it with: sudo journalctl -u {PI_SERVICE_NAME} -n 40\n"
          f"(If you have 'setup.py --lan' still running in a terminal, it's holding port {PI_PORT} — stop it.)")

    # Best effort — these are Raspberry Pi OS settings and I can't know ahead
    # of time that every image supports them, so a failure here is a warning,
    # not a reason to abort a setup that otherwise worked.
    if shutil.which("raspi-config"):
        for label, args in (
            ("boot to the desktop with auto-login", ["do_boot_behaviour", "B4"]),
            ("turn off screen blanking", ["do_blanking", "1"]),
        ):
            result = subprocess.run(_as_root(["raspi-config", "nonint", *args]))
            print(f"{'OK' if result.returncode == 0 else 'WARNING: could not'} — {label}")
    else:
        print("\nraspi-config not found — not a Raspberry Pi OS image? Make sure this machine auto-logs-in to a")
        print("desktop session and has screen blanking disabled, or the display will go dark/stay on a login screen.")

    print("\n=== Done ===")
    print(f"Server:  http://localhost:{PI_PORT}/  (service: {PI_SERVICE_NAME})")
    print("Display: opens full-screen on desktop login — reboot to try it:  sudo reboot")
    print("\nAfter updating the code (git pull), re-run:  python3 setup.py --pi-display   then reboot.")
    print("\nTo undo:")
    print(f"  sudo systemctl disable --now {PI_SERVICE_NAME} && sudo rm {PI_SERVICE_PATH}")
    print(f"  rm {autostart_path} {kiosk_script_path}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--setup-only", action="store_true", help="install everything but don't start the servers")
    parser.add_argument(
        "--lan",
        action="store_true",
        help="build the frontend and serve everything from one address on your network (port 80, falling back to 8080 if that needs elevated privileges) — recommended for reaching this from other devices",
    )
    parser.add_argument(
        "--pi-display",
        action="store_true",
        help="Raspberry Pi: set this machine up as a dedicated display — server runs as a systemd service, and Chromium opens full-screen on boot in the compact small-screen (7\" / 800x480) layout",
    )
    args = parser.parse_args()

    # Fail before the (slow) installs below, not after them.
    if args.pi_display and not sys.platform.startswith("linux"):
        print("--pi-display is for a Raspberry Pi (Linux) — it installs a systemd service and a desktop autostart entry.")
        sys.exit(2)

    setup_backend()
    frontend_ready = setup_frontend()

    if args.setup_only:
        print("\nSetup complete. Run 'python3 setup.py' again (without --setup-only) to start the app.")
        return

    if not frontend_ready:
        print("\nBackend is set up, but the frontend can't start without Node.js. Install it, then re-run this script.")
        sys.exit(1)

    if args.pi_display:
        build_frontend()
        install_pi_display()
    elif args.lan:
        build_frontend()
        run_combined_server(80)
    else:
        run_dev_servers()


if __name__ == "__main__":
    main()
