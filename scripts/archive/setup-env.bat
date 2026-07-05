@echo off
echo ========================================
echo   CONFIGURATION ENVIRONNEMENT
echo ========================================
echo.

REM Vérifier si .env existe déjà
if exist .env (
    echo [!] Le fichier .env existe deja.
    echo.
    choice /C YN /M "Voulez-vous le remplacer"
    if errorlevel 2 goto :end
    if errorlevel 1 goto :create
) else (
    goto :create
)

:create
echo.
echo [+] Creation du fichier .env...
copy .env.template .env >nul

if exist .env (
    echo [OK] Fichier .env cree avec succes!
    echo.
    echo ========================================
    echo   PROCHAINES ETAPES
    echo ========================================
    echo.
    echo 1. Ouvrez le fichier .env avec un editeur de texte
    echo 2. Remplacez DATABASE_URL par votre connection string Supabase
    echo 3. Remplacez SESSION_SECRET par un secret aleatoire
    echo.
    echo Pour generer un secret aleatoire:
    echo   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
    echo.
    echo 4. Consultez SUPABASE_SETUP.md pour les instructions detaillees
    echo.
    echo ========================================
    echo.
    choice /C YN /M "Voulez-vous ouvrir .env maintenant"
    if errorlevel 2 goto :end
    if errorlevel 1 notepad .env
) else (
    echo [ERREUR] Impossible de creer le fichier .env
    echo Verifiez que .env.template existe
)

:end
echo.
pause
