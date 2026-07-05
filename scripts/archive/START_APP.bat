@echo off
echo ========================================
echo Waler - Starting Full Application
echo ========================================
echo.
echo This will start:
echo 1. Backend server (Flask on port 5001)
echo 2. Frontend client (Vite on port 5173)
echo.
echo Press Ctrl+C in each window to stop
echo.
pause

echo Starting backend server...
start "Waler Backend" cmd /k "cd server && python app.py"

timeout /t 3 /nobreak >nul

echo Starting frontend client...
start "Waler Frontend" cmd /k "npm run dev"

echo.
echo ========================================
echo ✅ Application started!
echo ========================================
echo.
echo Backend: http://localhost:5001
echo Frontend: http://localhost:5173
echo.
echo Login with:
echo   Email: premium@waler.com
echo   Password: premium123
echo.
echo Your Premium plan should now be visible!
echo ========================================
