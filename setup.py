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
"""

import argparse
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


def have_node():
    return shutil.which("node") is not None and shutil.which("npm") is not None


def install_node():
    """Best-effort automatic Node.js install. Returns True if node+npm are
    on PATH afterward (freshly installed or already present)."""

    if have_node():
        return True

    print("Node.js/npm not found — installing it automatically...")
    system = platform.system()

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

    print("Node.js still isn't on PATH — you may need to open a new terminal, then re-run this script.")
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
    run([shutil.which("npm"), "run", "build"], cwd=FRONTEND)


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


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--setup-only", action="store_true", help="install everything but don't start the servers")
    parser.add_argument(
        "--lan",
        action="store_true",
        help="build the frontend and serve everything from one address on your network (port 80, falling back to 8080 if that needs elevated privileges) — recommended for reaching this from other devices",
    )
    args = parser.parse_args()

    setup_backend()
    frontend_ready = setup_frontend()

    if args.setup_only:
        print("\nSetup complete. Run 'python3 setup.py' again (without --setup-only) to start the app.")
        return

    if not frontend_ready:
        print("\nBackend is set up, but the frontend can't start without Node.js. Install it, then re-run this script.")
        sys.exit(1)

    if args.lan:
        build_frontend()
        run_combined_server(80)
    else:
        run_dev_servers()


if __name__ == "__main__":
    main()
