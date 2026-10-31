@echo off
cd /d "%~dp0"
call npm run setup
if errorlevel 1 goto failure
call npm run access
start "" http://127.0.0.1:5173
powershell -NoProfile -Command "try { $r=Invoke-RestMethod 'http://127.0.0.1:5173/api/health' -TimeoutSec 2; if ($r.status -eq 'ok') { exit 0 }; exit 1 } catch { exit 1 }"
if not errorlevel 1 goto end
call npm run dev
goto end
:failure
echo Nao foi possivel iniciar. Verifique o README.
:end
pause
