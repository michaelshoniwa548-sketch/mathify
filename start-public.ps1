# Start Maths Tutor with a public Cloudflare tunnel and update SEO URLs
$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ProjectRoot

$Port = 3002
$LogDir = Join-Path $ProjectRoot ".run"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

function Stop-Existing {
    Get-Process -Name "node","cloudflared" -ErrorAction SilentlyContinue |
        Where-Object { $_.Path -like "*Maths Tutor*" -or $_.CommandLine -like "*Maths Tutor*" } |
        Stop-Process -Force -ErrorAction SilentlyContinue
}

function Update-SeoUrls($BaseUrl) {
    $BaseUrl = $BaseUrl.TrimEnd('/')
    $indexPath = Join-Path $ProjectRoot "public\index.html"
    if (Test-Path $indexPath) {
        $html = Get-Content $indexPath -Raw
        $html = $html -replace 'https?://[^"\s>]+trycloudflare\.com', $BaseUrl
        $html = $html -replace 'https?://[^"\s>]+\.run\.app', $BaseUrl
        Set-Content $indexPath $html -NoNewline
    }
    $robotsPath = Join-Path $ProjectRoot "public\robots.txt"
    Set-Content $robotsPath "User-agent: *`nAllow: /`n`nSitemap: $BaseUrl/sitemap.xml" -NoNewline
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
}

$npm = (Get-Command npm.cmd -ErrorAction SilentlyContinue).Source
if (-not $npm) { $npm = "npm.cmd" }

Write-Host "Starting Maths Tutor server..."
$server = Start-Process -FilePath $npm -ArgumentList "run","prod" -WorkingDirectory $ProjectRoot -PassThru -WindowStyle Hidden -RedirectStandardOutput (Join-Path $LogDir "server.log") -RedirectStandardError (Join-Path $LogDir "server.err")

Start-Sleep -Seconds 3

Write-Host "Starting Cloudflare tunnel..."
$tunnelLog = Join-Path $LogDir "tunnel.log"
$tunnelErr = Join-Path $LogDir "tunnel.err"
$tunnel = Start-Process -FilePath "cloudflared" -ArgumentList "tunnel","--url","http://localhost:$Port" -PassThru -WindowStyle Hidden -RedirectStandardOutput $tunnelLog -RedirectStandardError $tunnelErr

$url = $null
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 2
    foreach ($logFile in @($tunnelLog, $tunnelErr)) {
        if (Test-Path $logFile) {
            $log = Get-Content $logFile -Raw -ErrorAction SilentlyContinue
            if ($log -match 'https://[a-z0-9-]+\.trycloudflare\.com') {
                $url = $Matches[0]
                break
            }
        }
    }
    if ($url) { break }
}

if (-not $url) {
    Write-Host "Tunnel started but URL not ready yet. Check $tunnelLog"
    exit 1
}

Update-SeoUrls $url
Set-Content (Join-Path $LogDir "public-url.txt") $url

Write-Host ""
Write-Host "Public URL: $url" -ForegroundColor Green
Write-Host "Server PID: $($server.Id) | Tunnel PID: $($tunnel.Id)"
Write-Host "Logs: $LogDir"
