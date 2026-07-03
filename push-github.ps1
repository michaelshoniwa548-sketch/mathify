# Create GitHub repo and push (run after: gh auth login)
$ErrorActionPreference = "Stop"
$env:Path = "C:\Program Files\Git\cmd;C:\Program Files\GitHub CLI;" + $env:Path
Set-Location (Split-Path -Parent $MyInvocation.MyCommand.Path)

gh auth status
if ($LASTEXITCODE -ne 0) {
    Write-Host "Not logged in. Run: gh auth login" -ForegroundColor Yellow
    gh auth login --web --git-protocol https
}

$remote = git remote get-url origin 2>$null
if ($remote) {
    Write-Host "Pushing to $remote ..."
    git push -u origin master
} else {
    Write-Host "Creating public repo mathify ..."
    gh repo create mathify --public --source=. --remote=origin --push --description "Mathify - AI Math Tutor with step-by-step solver, quizzes, and chat"
}

$url = (gh repo view --json url -q .url 2>$null)
if ($url) {
    Write-Host ""
    Write-Host "GitHub repo: $url" -ForegroundColor Green
}
