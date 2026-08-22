@echo off
setlocal
node "%~dp0vigilume_bridge.mjs" %*
exit /b %ERRORLEVEL%
