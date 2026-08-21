@echo off
setlocal EnableExtensions
reg delete "HKCU\Software\Google\Chrome\NativeMessagingHosts\com.nolane.sentinel_bridge" /f >nul 2>nul
del /q "%~dp0com.nolane.sentinel_bridge.json" >nul 2>nul
echo Da go Native Messaging host cua Nolane Sentinel.
exit /b 0
