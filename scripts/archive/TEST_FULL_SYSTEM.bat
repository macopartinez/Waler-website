@echo off
echo ========================================
echo    WALER - TEST COMPLET
echo ========================================
echo.

echo [1/6] Verification Node.js...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERREUR: Node.js non installe
    echo Telecharger sur: https://nodejs.org
    pause
    exit /b 1
)
echo ✓ Node.js installe
echo.

echo [2/6] Installation dependances backend...
call npm install
if %errorlevel% neq 0 (
    echo ERREUR: Installation backend echouee
    pause
    exit /b 1
)
echo ✓ Backend pret
echo.

echo [3/6] Installation dependances extension...
cd waler-extension
call npm install
if %errorlevel% neq 0 (
    echo ERREUR: Installation extension echouee
    pause
    exit /b 1
)
echo ✓ Extension prete
echo.

echo [4/6] Build de l'extension...
call npm run build
if %errorlevel% neq 0 (
    echo ERREUR: Build extension echoue
    pause
    exit /b 1
)
cd ..
echo ✓ Extension buildee
echo.

echo [5/6] Initialisation base de donnees...
call npm run init-classification-db
if %errorlevel% neq 0 (
    echo ATTENTION: Initialisation BDD echouee (peut-etre deja faite)
)
echo ✓ Base de donnees prete
echo.

echo [6/6] Lancement du serveur...
echo.
echo ========================================
echo    SERVEUR DEMARRE !
echo ========================================
echo.
echo Backend: http://localhost:5000
echo.
echo PROCHAINES ETAPES:
echo.
echo 1. Creer un compte sur http://localhost:5000
echo 2. Charger l'extension dans Chrome:
echo    - Aller sur chrome://extensions/
echo    - Activer "Mode developpeur"
echo    - "Charger extension non empaquetee"
echo    - Selectionner: waler-extension\dist
echo.
echo 3. Tester sur Instagram:
echo    - Aller sur instagram.com
echo    - Se connecter
echo    - Cliquer sur l'icone Waler
echo    - Envoyer des DMs
echo.
echo 4. Verifier dans le dashboard:
echo    - http://localhost:5000/classification
echo    - http://localhost:5000/surveillance
echo.
echo Guide complet: EXTENSION_TESTING_GUIDE.md
echo.
echo Appuyez sur Ctrl+C pour arreter le serveur
echo.

call npm run dev
