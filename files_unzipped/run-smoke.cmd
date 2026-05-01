@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo [cwd] %CD%
if not exist "package.json" (
  echo ERROR: package.json が見つかりません。この .cmd は files_unzipped フォルダに置いてください。
  pause
  exit /b 1
)
call npm run test:smoke
if errorlevel 1 (
  echo.
  echo --- うまくいかないとき ---
  echo 1 このフォルダに .env があるか（名前は .env で .env.txt ではない）
  echo 2 SUPABASE_URL と SUPABASE_KEY=service_role の行があるか
  echo 3 Node が入っているか: node -v
  pause
  exit /b 1
)
pause
