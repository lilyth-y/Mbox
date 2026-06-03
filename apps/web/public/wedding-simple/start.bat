@echo off
title Wedding Hologram Operator Web Starter
echo ===================================================
echo   Wedding Hologram Operator Standalone Service
echo   Starting local server on http://localhost:5173/wedding-simple/ ...
echo ===================================================
echo.
echo Make sure that the backend API server is running on http://localhost:8787.
echo.

:: Open browser on Vite Web Service path
start http://localhost:5173/wedding-simple/

pause
