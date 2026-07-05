@echo off
echo ========================================
echo    Waler - Quick Start Script
echo ========================================
echo.

REM Check if database exists
if not exist "server\waler.db" (
    echo [1/4] Initializing database...
    cd server
    python init_db.py
    cd ..
    echo.
) else (
    echo [1/4] Database already exists (skipping)
    echo.
)

REM Install Python dependencies
echo [2/4] Installing Python dependencies...
cd server
pip install -r requirements.txt
cd ..
echo.

REM Install Node dependencies (if needed)
if not exist "client\node_modules" (
    echo [3/4] Installing Node dependencies...
    cd client
    call npm install
    cd ..
    echo.
) else (
    echo [3/4] Node dependencies already installed (skipping)
    echo.
)

echo [4/4] Starting servers...
echo.
echo ========================================
echo    Servers are starting!
echo ========================================
echo.
echo Backend:  http://localhost:5000
echo Frontend: http://localhost:5173
echo.
echo Press Ctrl+C to stop both servers
echo ========================================
echo.

REM Start both servers in new windows
start "Waler Backend" cmd /k "cd server && python app.py"
timeout /t 2 /nobreak > nul
start "Waler Frontend" cmd /k "cd client && npm run dev"

echo.
echo Both servers started in separate windows!
echo Close this window or press any key to exit...
pause > nul
