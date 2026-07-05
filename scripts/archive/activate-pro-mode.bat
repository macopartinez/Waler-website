@echo off
echo ========================================
echo   ACTIVATION DU MODE PRO (DEV)
echo ========================================
echo.
echo Ce script va activer le mode Pro pour votre compte.
echo.
pause

echo.
echo Envoi de la requete...
curl -X POST http://localhost:5000/api/subscription/force-pro ^
  -H "Content-Type: application/json" ^
  --cookie-jar cookies.txt ^
  --cookie cookies.txt

echo.
echo.
echo ========================================
echo Verification du statut...
echo ========================================
curl -X GET http://localhost:5000/api/subscription/status ^
  -H "Content-Type: application/json" ^
  --cookie-jar cookies.txt ^
  --cookie cookies.txt

echo.
echo.
echo ========================================
echo   TERMINE!
echo ========================================
echo.
echo Rechargez la page dans votre navigateur pour voir les changements.
echo.
pause
