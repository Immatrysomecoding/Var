@echo off
echo Starting Lavaro VAR System...

:: Start Docker backend (detached)
docker compose -f docker-compose.yml -f fake-camera.yml up -d --build

:: Start Lavaro UI in a minimised background window
start /min "Lavaro UI" cmd /c "cd /d %~dp0lavaro-ui-mockup && pnpm dev"

echo.
echo  System is ON
echo  ----------------------------------------
echo  Court monitor : http://localhost:3000
echo  Courtside     : http://localhost:3000/courtside
echo  API           : http://localhost:8000
echo  ----------------------------------------
