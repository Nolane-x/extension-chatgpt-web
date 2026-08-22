@echo off
setlocal EnableExtensions
reg delete "HKCU\Software\Google\Chrome\NativeMessagingHosts\com.vigilume.bridge" /f >nul 2>nul
reg delete "HKCU\Software\Google\Chrome\NativeMessagingHosts\com.nolane.sentinel_bridge" /f >nul 2>nul
del /q "%~dp0com.vigilume.bridge.json" >nul 2>nul
del /q "%~dp0com.nolane.sentinel_bridge.json" >nul 2>nul
echo Da go Vigilume Native Messaging host va legacy registration neu co.
exit /b 0
