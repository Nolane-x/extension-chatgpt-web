@echo off
setlocal EnableExtensions
set "HOST_NAME=com.nolane.sentinel_bridge"
set "EXTENSION_ID=%~1"
if "%EXTENSION_ID%"=="" (
  echo Cach dung: install_host.bat ^<CHROME_EXTENSION_ID^>
  exit /b 2
)
if "%EXTENSION_ID:~31,1%"=="" (
  echo Extension ID phai dai 32 ky tu.
  exit /b 2
)
if not "%EXTENSION_ID:~32,1%"=="" (
  echo Extension ID phai dai 32 ky tu.
  exit /b 2
)
set "MANIFEST=%~dp0com.nolane.sentinel_bridge.json"
>"%MANIFEST%" echo {
>>"%MANIFEST%" echo   "name": "com.nolane.sentinel_bridge",
>>"%MANIFEST%" echo   "description": "Nolane Sentinel local AI/MCP bridge",
>>"%MANIFEST%" echo   "path": "nolane-sentinel-native-host.bat",
>>"%MANIFEST%" echo   "type": "stdio",
>>"%MANIFEST%" echo   "allowed_origins": ["chrome-extension://%EXTENSION_ID%/"]
>>"%MANIFEST%" echo }
reg add "HKCU\Software\Google\Chrome\NativeMessagingHosts\%HOST_NAME%" /ve /t REG_SZ /d "%MANIFEST%" /f >nul
if errorlevel 1 (
  echo Khong the dang ky Native Messaging host.
  exit /b 3
)
echo Da cai Native Messaging host: %MANIFEST%
echo Khoi dong lai Chrome neu bridge chua ket noi ngay.
exit /b 0
