@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Ritual Party - enviar para o GitHub
set "GIT=git"
where git >nul 2>nul || set "GIT=C:\Program Files\Git\cmd\git.exe"

"%GIT%" remote remove origin >nul 2>nul
"%GIT%" remote add origin https://github.com/dkzinbr/ritual-party.git
"%GIT%" branch -M main
echo Enviando para o GitHub... (se abrir uma janela de login, entre com sua conta)
"%GIT%" push -u origin main > push-log.txt 2>&1
type push-log.txt
echo.
echo Pronto. Pode fechar esta janela.
pause
