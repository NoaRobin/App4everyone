@echo off
REM Lanceur Windows : double-cliquer, ou "run.bat --fabric" pour le Lakehouse Fabric
cd /d "%~dp0"
where py >NUL 2>NUL
if %errorlevel%==0 (py -3 run.py %*) else (python run.py %*)
if errorlevel 1 pause
