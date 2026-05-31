# Deploy Maths Tutor to Google Cloud Run (uses Vertex AI Gemini on Google Cloud)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ProjectRoot

$ServiceName = "maths-tutor"
$Region = "us-central1"
$ProjectId = if ($env:GCP_PROJECT) { $env:GCP_PROJECT } else { "gen-lang-client-0569419562" }

function Update-SeoUrls($BaseUrl) {
    $BaseUrl = $BaseUrl.TrimEnd('/')

    $indexPath = Join-Path $ProjectRoot "public\index.html"
    if (Test-Path $indexPath) {
        $html = Get-Content $indexPath -Raw
        $html = $html -replace 'https?://[^"\s>]+trycloudflare\.com', $BaseUrl
        $html = $html -replace 'https?://[^"\s>]+\.loca\.lt', $BaseUrl
        $html = $html -replace 'https?://[^"\s>]+\.run\.app', $BaseUrl
        Set-Content $indexPath $html -NoNewline
    }

    $robotsPath = Join-Path $ProjectRoot "public\robots.txt"
    if (Test-Path $robotsPath) {
        Set-Content $robotsPath "User-agent: *`nAllow: /`n`nSitemap: $BaseUrl/sitemap.xml" -NoNewline
    }

    $sitemapPath = Join-Path $ProjectRoot "public\sitemap.xml"
    if (Test-Path $sitemapPath) {
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
"@ | Set-Content $sitemapPath -NoNewline
    }

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

# Find gcloud
$gcloud = Get-Command gcloud -ErrorAction SilentlyContinue
if (-not $gcloud) {
    $defaultPath = "$env:LOCALAPPDATA\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd"
    if (Test-Path $defaultPath) { $gcloud = $defaultPath } else {
        Write-Host "gcloud CLI not found. Install with: winget install Google.CloudSDK" -ForegroundColor Red
        exit 1
    }
} else {
    $gcloud = $gcloud.Source
}

Write-Host "Checking Google Cloud authentication..."
$account = & $gcloud auth list --filter=status:ACTIVE --format="value(account)" 2>$null
if (-not $account) {
    Write-Host "Please sign in to Google Cloud (browser will open)..."
    & $gcloud auth login
}

& $gcloud config set project $ProjectId

Write-Host "Enabling required APIs..."
$ErrorActionPreference = "Continue"
$enableResult = & $gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com aiplatform.googleapis.com --quiet 2>&1
$ErrorActionPreference = "Stop"
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "Billing is required for Google Cloud Run (free tier available)." -ForegroundColor Yellow
    Write-Host "1. Open: https://console.cloud.google.com/billing/linkedaccount?project=$ProjectId"
    Write-Host "2. Link a billing account (you won't be charged unless you exceed free limits)"
    Write-Host "3. Run: npm run deploy"
    exit 1
}

$projectNumber = (& $gcloud projects describe $ProjectId --format="value(projectNumber)").Trim()
$serviceAccount = "$projectNumber-compute@developer.gserviceaccount.com"
Write-Host "Granting Vertex AI access to Cloud Run service account..."
& $gcloud projects add-iam-policy-binding $ProjectId `
    --member="serviceAccount:$serviceAccount" `
    --role="roles/aiplatform.user" `
    --quiet 2>$null | Out-Null

Write-Host "Deploying to Cloud Run..."
& $gcloud run deploy $ServiceName `
    --source . `
    --region $Region `
    --allow-unauthenticated `
    --set-env-vars "GEMINI_MODEL=gemini-2.0-flash,VERTEX_LOCATION=$Region" `
    --quiet

$url = (& $gcloud run services describe $ServiceName --region $Region --format="value(status.url)").Trim()
Write-Host ""
Write-Host "Deployed successfully!" -ForegroundColor Green
Write-Host "Permanent URL: $url"
Write-Host ""

Update-SeoUrls $url

Write-Host ""
Write-Host "Next: Submit to Google Search Console"
Write-Host "  1. Open https://search.google.com/search-console"
Write-Host "  2. Add property: $url"
Write-Host "  3. Submit sitemap: $url/sitemap.xml"
