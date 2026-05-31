# Free deploy to Render.com (no credit card, permanent URL)
# Requires: free Gemini API key from https://aistudio.google.com/apikey

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ProjectRoot

function Update-SeoUrls($BaseUrl) {
    $BaseUrl = $BaseUrl.TrimEnd('/')
    $indexPath = Join-Path $ProjectRoot "public\index.html"
    if (Test-Path $indexPath) {
        $html = Get-Content $indexPath -Raw
        $html = $html -replace 'https?://[^"\s>]+trycloudflare\.com', $BaseUrl
        $html = $html -replace 'https?://[^"\s>]+\.onrender\.com', $BaseUrl
        $html = $html -replace 'https?://[^"\s>]+\.run\.app', $BaseUrl
        Set-Content $indexPath $html -NoNewline
    }
    Set-Content (Join-Path $ProjectRoot "public\robots.txt") "User-agent: *`nAllow: /`n`nSitemap: $BaseUrl/sitemap.xml" -NoNewline
    $today = Get-Date -Format "yyyy-MM-dd"
    @"
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>$BaseUrl/</loc>
    <lastmod>$today</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>
"@ | Set-Content (Join-Path $ProjectRoot "public\sitemap.xml") -NoNewline
    Write-Host "Updated SEO files with $BaseUrl"
}

# Load .env
$envFile = Join-Path $ProjectRoot ".env"
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        if ($_ -match '^\s*([^#=]+?)\s*=\s*(.*)$') {
            [Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2].Trim(), "Process")
        }
    }
}

Write-Host ""
Write-Host "=== Free Deploy (Render + Gemini) ===" -ForegroundColor Cyan
Write-Host ""

if (-not $env:GEMINI_API_KEY) {
    Write-Host "Step 1: Get a FREE Gemini API key (no billing required)" -ForegroundColor Yellow
    Write-Host "  -> https://aistudio.google.com/apikey"
    Start-Process "https://aistudio.google.com/apikey"
    $key = Read-Host "Paste your GEMINI_API_KEY here"
    if (-not $key) { Write-Host "API key required." -ForegroundColor Red; exit 1 }
    if (-not (Test-Path $envFile)) { Copy-Item (Join-Path $ProjectRoot ".env.example") $envFile }
    (Get-Content $envFile -Raw) -replace 'GEMINI_API_KEY=.*', "GEMINI_API_KEY=$key" | Set-Content $envFile -NoNewline
    $env:GEMINI_API_KEY = $key
}

Write-Host ""
Write-Host "Step 2: Deploy on Render (free, no credit card)" -ForegroundColor Yellow
Write-Host ""
Write-Host "In the browser that opens:"
Write-Host "  1. Sign up free at render.com (GitHub login works)"
Write-Host "  2. New + -> Blueprint -> connect this repo OR:"
Write-Host "     New + -> Web Service -> Deploy from GitHub"
Write-Host "  3. Select repo, set Environment Variable:"
Write-Host "     GEMINI_API_KEY = (your key)"
Write-Host "  4. Plan: Free -> Deploy"
Write-Host ""
Write-Host "Your permanent URL will be: https://maths-tutor.onrender.com"
Write-Host "(or similar — copy it after deploy and run: npm run update-url <your-url>)"
Write-Host ""

Start-Process "https://dashboard.render.com/select-repo?type=blueprint"

# Offer to update URL if user already has one
$existingUrl = Read-Host "Already deployed? Paste your Render URL here (or press Enter to skip)"
if ($existingUrl) {
    Update-SeoUrls $existingUrl
    Write-Host ""
    Write-Host "Done! Update Google Search Console with the new URL." -ForegroundColor Green
}
