@echo off
echo Stopping Lavaro VAR System...

:: Stop Docker backend
docker compose -f docker-compose.yml -f fake-camera.yml down

:: Kill the Lavaro UI dev server (port 3000)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3000 "') do (
  taskkill /F /PID %%a >nul 2>&1
)

echo.
echo  System is OFF
