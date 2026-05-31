param([Parameter(Mandatory=$true)][string]$Url)
$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$BaseUrl = $Url.TrimEnd('/')

$indexPath = Join-Path $ProjectRoot "public\index.html"
$html = Get-Content $indexPath -Raw
$html = $html -replace 'https?://[^"\s>]+trycloudflare\.com', $BaseUrl
$html = $html -replace 'https?://[^"\s>]+\.onrender\.com', $BaseUrl
$html = $html -replace 'https?://[^"\s>]+\.run\.app', $BaseUrl
Set-Content $indexPath $html -NoNewline

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

Write-Host "SEO updated to $BaseUrl"
