# PyInstaller build spec for the Kynren Network Relay Agent.
#
# Build (from this "agent" directory, in a venv with requirements-network-relay.txt installed):
#   pyinstaller relay_agent.spec --noconfirm
#
# Output: dist/KynrenRelayAgent.exe — a single, dependency-free executable. Copy it anywhere on
# the target Windows machine (inside the LAN you want it to scan) and double-click it; see
# README.md's "Network Relay Agent" section for the full walkthrough.
#
# win32timezone/win32ctypes are pulled in explicitly: PyInstaller's pywin32 hook doesn't always
# discover them since kynren_network_relay_service.py imports servicemanager/win32serviceutil
# rather than win32timezone directly, but pywin32's own service bookkeeping needs it at runtime.
block_cipher = None

a = Analysis(
    ["kynren_relay_agent_main.py"],
    pathex=[],
    binaries=[],
    datas=[],
    hiddenimports=[
        "win32timezone",
        "win32service",
        "win32serviceutil",
        "win32event",
        "servicemanager",
        "pywintypes",
        "win32ctypes.pywin32",
    ],
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
