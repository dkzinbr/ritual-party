@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Ritual Party - salvar alteracoes
set "GIT=git"
where git >nul 2>nul || set "GIT=C:\Program Files\Git\cmd\git.exe"
set "MSG=%~1"
if "%MSG%"=="" set "MSG=Ignore local helper scripts and logs"
(
  "%GIT%" add -A
  echo --- status ---
  "%GIT%" status --short
  echo --- commit ---
  "%GIT%" commit -m "%MSG%"
  echo --- push ---
  "%GIT%" push
  echo --- log ---
  "%GIT%" log --oneline -3
  echo --- pendente ---
  "%GIT%" status --short
) > salvar-log.txt 2>&1
type salvar-log.txt
echo.
echo Pronto. Pode fechar esta janela.
pause
