@echo off
setlocal
node "%~dp0nolane_bridge.mjs" %*
exit /b %ERRORLEVEL%
