@echo off
echo ========================================
echo Waler - Premium Upgrade
echo ========================================
echo.
echo Choose an option:
echo 1. Quick create premium user (default credentials)
echo 2. Create custom premium user (choose your credentials)
echo 3. Upgrade my account by email
echo 4. Upgrade user by ID
echo 5. Exit
echo.
set /p choice="Enter your choice (1-5): "

if "%choice%"=="1" (
    python quick_premium.py
) else if "%choice%"=="2" (
    python create_premium_user.py
) else if "%choice%"=="3" (
    python set_my_premium.py
) else if "%choice%"=="4" (
    python upgrade_to_premium.py
) else if "%choice%"=="5" (
    exit
) else (
    echo Invalid choice!
    pause
)

pause
