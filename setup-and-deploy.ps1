# One-time setup + deploy for Google Cloud Run
# Run: powershell -ExecutionPolicy Bypass -File setup-and-deploy.ps1

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ProjectRoot

$gcloud = "$env:LOCALAPPDATA\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd"
if (-not (Test-Path $gcloud)) {
    Write-Host "Installing Google Cloud SDK..." -ForegroundColor Yellow
    winget install Google.CloudSDK --accept-package-agreements --accept-source-agreements
}

# Step 1: Gemini API key
$envFile = Join-Path $ProjectRoot ".env"
if (-not (Test-Path $envFile)) {
    Copy-Item (Join-Path $ProjectRoot ".env.example") $envFile
}

$currentKey = ""
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        if ($_ -match '^\s*GEMINI_API_KEY\s*=\s*(.+)$') { $currentKey = $matches[1].Trim() }
    }
}

if (-not $currentKey) {
    Write-Host ""
    Write-Host "=== Step 1: Gemini API Key ===" -ForegroundColor Cyan
    Write-Host "Get a free key at: https://aistudio.google.com/apikey"
    $key = Read-Host "Paste your GEMINI_API_KEY here"
    if (-not $key) { Write-Host "API key required." -ForegroundColor Red; exit 1 }
    (Get-Content $envFile -Raw) -replace 'GEMINI_API_KEY=.*', "GEMINI_API_KEY=$key" | Set-Content $envFile -NoNewline
}

# Step 2: Google Cloud login
Write-Host ""
Write-Host "=== Step 2: Google Cloud Login ===" -ForegroundColor Cyan
$account = & $gcloud auth list --filter=status:ACTIVE --format="value(account)" 2>$null
if (-not $account) {
    Write-Host "A browser window will open. Sign in with your Google account."
    & $gcloud auth login
}

# Step 3: Deploy
Write-Host ""
Write-Host "=== Step 3: Deploying to Cloud Run ===" -ForegroundColor Cyan
& (Join-Path $ProjectRoot "deploy.ps1")
