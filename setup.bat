@echo off
setlocal EnableDelayedExpansion

set "SCRIPT_DIR=%~dp0"
set "PYTHON_VERSION=3.12.8"

set "IS_PACKAGED=0"
if exist "%SCRIPT_DIR%..\AutoWSGR-GUI.exe" (
    set "IS_PACKAGED=1"
    set "APP_DIR=%SCRIPT_DIR%.."
) else (
    set "APP_DIR=%SCRIPT_DIR%"
)

set "PYTHON_DIR=%APP_DIR%\python"
set "PYTHON_EXE=%PYTHON_DIR%\python.exe"
set "TEMP_DIR=%APP_DIR%\_setup_tmp"

echo.
echo  === AutoWSGR-GUI Environment Setup ===
echo  APP_DIR: %APP_DIR%
echo.

if not exist "%TEMP_DIR%" mkdir "%TEMP_DIR%"

:: --- Python (portable) ---
echo [1/3] Checking Python...

:: Check local portable Python first
if exist "%PYTHON_EXE%" (
    for /f "tokens=2 delims= " %%v in ('"%PYTHON_EXE%" --version 2^>^&1') do set "PY_VER=%%v"
    for /f "tokens=1,2 delims=." %%a in ("!PY_VER!") do (
        if %%a==3 if %%b==12 (
            echo       OK: Local Python !PY_VER!
            goto :python_ok
        )
        if %%a==3 if %%b==13 (
            echo       OK: Local Python !PY_VER!
            goto :python_ok
        )
    )
    echo       WARNING: Local Python !PY_VER! not compatible (need 3.12 or 3.13^)
)

:: Check system Python
set "SYS_PYTHON="
where python >nul 2>&1
if %errorlevel%==0 (
    for /f "tokens=2 delims= " %%v in ('python --version 2^>^&1') do set "PY_VER=%%v"
    for /f "tokens=1,2 delims=." %%a in ("!PY_VER!") do (
        if %%a==3 if %%b==12 (
            set "PYTHON_EXE=python"
            echo       OK: System Python !PY_VER!
            goto :python_ok
        )
        if %%a==3 if %%b==13 (
            set "PYTHON_EXE=python"
            echo       OK: System Python !PY_VER!
            goto :python_ok
        )
    )
    echo       WARNING: System Python !PY_VER! not compatible (need 3.12 or 3.13^)
)

:: Download portable Python
echo       Downloading Python %PYTHON_VERSION% portable...
set "PY_ZIP_URL=https://www.python.org/ftp/python/%PYTHON_VERSION%/python-%PYTHON_VERSION%-embed-amd64.zip"
echo       URL: !PY_ZIP_URL!
curl -L -o "%TEMP_DIR%\python-embed.zip" "!PY_ZIP_URL!"
if !errorlevel! neq 0 (
    echo       FAILED: download Python failed
    goto :error
)

echo       Extracting...
if not exist "%PYTHON_DIR%" mkdir "%PYTHON_DIR%"
powershell -NoProfile -Command "Expand-Archive -Path '%TEMP_DIR%\python-embed.zip' -DestinationPath '%PYTHON_DIR%' -Force"
set "PYTHON_EXE=%PYTHON_DIR%\python.exe"

:: Enable site-packages for pip
set "PTH_FILE=%PYTHON_DIR%\python312._pth"
if exist "!PTH_FILE!" (
    powershell -NoProfile -Command "(Get-Content '!PTH_FILE!') -replace '^#import site','import site' | Set-Content '!PTH_FILE!'"
)

:: Install pip
echo       Installing pip...
curl -sSL -o "%TEMP_DIR%\get-pip.py" "https://bootstrap.pypa.io/get-pip.py"
if !errorlevel! neq 0 (
    echo       FAILED: download get-pip.py failed
    goto :error
)
"!PYTHON_EXE!" "%TEMP_DIR%\get-pip.py"
if !errorlevel! neq 0 (
    echo       FAILED: pip install failed
    goto :error
)
echo       OK: Python %PYTHON_VERSION% portable installed

:python_ok

:: Configure TLS cert path for pip/requests
set "SSL_CERT_FILE="
for /f "usebackq delims=" %%p in (`"%PYTHON_EXE%" -c "import ssl, os; p=ssl.get_default_verify_paths().cafile; print(p if p and os.path.exists(p) else '')" 2^>nul`) do set "SSL_CERT_FILE=%%p"
if not defined SSL_CERT_FILE (
    for /f "usebackq delims=" %%p in (`"%PYTHON_EXE%" -c "import certifi; print(certifi.where())" 2^>nul`) do set "SSL_CERT_FILE=%%p"
)
if not defined SSL_CERT_FILE (
    for /f "usebackq delims=" %%p in (`"%PYTHON_EXE%" -c "import pip._vendor.certifi as c; print(c.where())" 2^>nul`) do set "SSL_CERT_FILE=%%p"
)
if defined SSL_CERT_FILE (
    if exist "!SSL_CERT_FILE!" (
        set "REQUESTS_CA_BUNDLE=!SSL_CERT_FILE!"
        set "PIP_CERT=!SSL_CERT_FILE!"
        set "CURL_CA_BUNDLE=!SSL_CERT_FILE!"
        echo       TLS cert: !SSL_CERT_FILE!
    ) else (
        set "SSL_CERT_FILE="
    )
)
if not defined SSL_CERT_FILE (
    echo       WARNING: TLS cert file not detected, HTTPS operations may fail
)

:: --- Python Dependencies ---
echo [2/2] Installing Python dependencies...

:: Install to project local directory, never touch global
set "TARGET_DIR=%APP_DIR%\python\site-packages"
if not exist "%TARGET_DIR%" mkdir "%TARGET_DIR%"

"!PYTHON_EXE!" -m pip install --upgrade pip 2>nul
"!PYTHON_EXE!" -m pip install --target "%TARGET_DIR%" --upgrade setuptools autowsgr
if !errorlevel! neq 0 (
    echo       FAILED: pip install autowsgr failed
    goto :error
)
echo       OK: autowsgr installed to project directory

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
