# PyInstaller build spec for the Kynren Network Relay Agent.
#
# Build (from this "agent" directory, in a venv with requirements-network-relay.txt installed):
#   pyinstaller relay_agent.spec --noconfirm
#
# Output: dist/KynrenRelayAgent.exe — a single, dependency-free executable. Copy it anywhere on
# the target Windows machine (inside the LAN you want it to scan) and double-click it; see
# README.md's "Network Relay Agent" section for the full walkthrough.
#
# No pywin32/service hidden imports here — kynren_relay_agent_main.py runs the agent as a plain
# console loop (same code path as `python kynren_network_relay.py`), not as a Windows Service, so
# there's nothing pywin32-specific for PyInstaller to bundle.
block_cipher = None

a = Analysis(
    ["kynren_relay_agent_main.py"],
    pathex=[],
    binaries=[],
    datas=[],
    hiddenimports=[],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)
pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name="KynrenRelayAgent",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
