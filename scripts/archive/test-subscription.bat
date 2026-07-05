@echo off
echo Testing subscription status...
curl -X GET http://localhost:5000/api/subscription/status -H "Content-Type: application/json" --cookie-jar cookies.txt --cookie cookies.txt
echo.
pause
