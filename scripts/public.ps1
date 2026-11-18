$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)

function Find-Cloudflared {
  $cmd = Get-Command cloudflared -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  $local = Join-Path $PSScriptRoot "cloudflared.exe"
  if (Test-Path $local) { return $local }
  return $null
}

$cloudflared = Find-Cloudflared
if (-not $cloudflared) {
  Write-Host "Baixando o tunel do Cloudflare..."
  $url = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"
  $target = Join-Path $PSScriptRoot "cloudflared.exe"
  Invoke-WebRequest -Uri $url -OutFile $target
  $cloudflared = $target
}

Write-Host "Montando o site..."
npm run build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$listening = Get-NetTCPConnection -LocalPort 8787 -State Listen -ErrorAction SilentlyContinue
$server = $null
if (-not $listening) {
  $server = Start-Process -FilePath "npm.cmd" -ArgumentList "start" -PassThru -WindowStyle Hidden
  Start-Sleep -Seconds 2
}

Write-Host ""
Write-Host "O PC e o servidor da festa. Deixe esta janela aberta."
Write-Host "O link https aparece abaixo. Mande esse link para o pessoal."
Write-Host "Mestre: o mesmo link + /mestre"
Write-Host ""

try {
  & $cloudflared tunnel --url http://127.0.0.1:8787 --no-autoupdate
} finally {
  if ($server -and -not $server.HasExited) {
    Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue
  }
}
