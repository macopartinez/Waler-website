@echo off
echo ========================================
echo   Waler Extension - Package Builder
echo ========================================
echo.

echo [1/3] Installing dependencies...
call npm install
if %errorlevel% neq 0 (
    echo ERROR: npm install failed
    pause
    exit /b 1
)

echo.
echo [2/3] Building extension...
call npm run build
if %errorlevel% neq 0 (
    echo ERROR: Build failed
    pause
    exit /b 1
)

echo.
echo [3/3] Creating packages...
call npm run package
if %errorlevel% neq 0 (
    echo ERROR: Packaging failed
    pause
    exit /b 1
)

echo.
echo ========================================
echo   SUCCESS! Packages created in ./releases/
echo ========================================
echo.
echo Next steps:
echo   1. Test packages in browsers
echo   2. Read PUBLICATION_GUIDE.md
echo   3. Upload to stores
echo.
pause
