@echo off
setlocal EnableDelayedExpansion

set "SCRIPT_DIR=%~dp0"
set "PYTHON_VERSION=3.12.8"
set "PYTHON_INSTALLER=python-%PYTHON_VERSION%-amd64.exe"
set "BACKEND_REPO=OpenWSGR/AutoWSGR"
set "BACKEND_BRANCH=main"

set "IS_PACKAGED=0"
if exist "%SCRIPT_DIR%..\AutoWSGR-GUI.exe" (
    set "IS_PACKAGED=1"
    set "APP_DIR=%SCRIPT_DIR%.."
) else (
    set "APP_DIR=%SCRIPT_DIR%"
)

set "TEMP_DIR=%APP_DIR%\_setup_tmp"

echo.
echo  === AutoWSGR-GUI Environment Setup ===
echo  APP_DIR: %APP_DIR%
echo.

if not exist "%TEMP_DIR%" mkdir "%TEMP_DIR%"

:: --- Python ---
echo [1/3] Checking Python...

set "PYTHON_CMD="
where python >nul 2>&1
if %errorlevel%==0 (
    for /f "tokens=2 delims= " %%v in ('python --version 2^>^&1') do set "PY_VER=%%v"
    for /f "tokens=1,2 delims=." %%a in ("!PY_VER!") do (
        if %%a GEQ 3 if %%b GEQ 12 (
            set "PYTHON_CMD=python"
            echo       OK: Python !PY_VER!
        )
    )
)

if not defined PYTHON_CMD (
    echo       Python 3.12+ not found, downloading...
    set "PY_URL=https://www.python.org/ftp/python/%PYTHON_VERSION%/%PYTHON_INSTALLER%"
    echo       URL: !PY_URL!
    curl -L -o "%TEMP_DIR%\%PYTHON_INSTALLER%" "!PY_URL!"
    if !errorlevel! neq 0 (
        echo       FAILED: download Python failed
        goto :error
    )
    echo       Installing Python %PYTHON_VERSION%, please check Add to PATH...
    "%TEMP_DIR%\%PYTHON_INSTALLER%" InstallAllUsers=0 PrependPath=1 Include_pip=1 Include_launcher=1
    if !errorlevel! neq 0 (
        echo       FAILED: Python install failed
        goto :error
    )
    set "PATH=%LOCALAPPDATA%\Programs\Python\Python312\Scripts\;%LOCALAPPDATA%\Programs\Python\Python312\;!PATH!"
    for /f "tokens=*" %%i in ('where python 2^>nul') do set "PYTHON_CMD=%%i"
    if not defined PYTHON_CMD (
        set "PYTHON_CMD=%LOCALAPPDATA%\Programs\Python\Python312\python.exe"
        if not exist "!PYTHON_CMD!" (
            echo       FAILED: Python not found after install, please restart terminal
            goto :error
        )
    )
    echo       OK: Python %PYTHON_VERSION% installed
)

:: --- Backend Code ---
echo [2/3] Checking backend code...

set "BACKEND_DIR=%APP_DIR%\autowsgr"
if exist "%BACKEND_DIR%\pyproject.toml" (
    echo       OK: backend code exists at %BACKEND_DIR%
) else (
    set "BACKEND_ZIP_URL=https://github.com/%BACKEND_REPO%/archive/refs/heads/%BACKEND_BRANCH%.zip"
    echo       Downloading from: !BACKEND_ZIP_URL!
    curl -L -o "%TEMP_DIR%\autowsgr.zip" "!BACKEND_ZIP_URL!"
    if !errorlevel! neq 0 (
        echo       FAILED: download backend failed, check network
        goto :error
    )
    echo       Extracting...
    if exist "%BACKEND_DIR%" rmdir /s /q "%BACKEND_DIR%"
    powershell -NoProfile -Command "Expand-Archive -Path '%TEMP_DIR%\autowsgr.zip' -DestinationPath '%TEMP_DIR%\backend_extract' -Force"
    for /d %%d in ("%TEMP_DIR%\backend_extract\AutoWSGR-*") do (
        move "%%d" "%BACKEND_DIR%" >nul
    )
    echo       OK: backend code downloaded
)

:: --- Python Dependencies ---
echo [3/3] Installing Python dependencies...

pushd "%APP_DIR%"
"!PYTHON_CMD!" -m pip install --upgrade pip 2>nul
"!PYTHON_CMD!" -m pip install -e "./autowsgr"
if !errorlevel! neq 0 (
    echo       FAILED: pip install failed
    popd
    goto :error
)
echo       OK: Python dependencies installed
popd

:: --- Cleanup ---
echo.
echo  Cleaning up temp files...
if exist "%TEMP_DIR%" rmdir /s /q "%TEMP_DIR%"

echo.
echo  Setup complete! Run AutoWSGR-GUI.exe to start.
echo.
pause
exit /b 0

:error
echo.
echo  ERROR: Setup failed, see log above.
echo.
pause
exit /b 1
