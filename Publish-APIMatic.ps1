$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
function Assert-Exit([string]$step) {
    if ($LASTEXITCODE -ne 0) { throw "$step failed. Publishing stopped; nothing was force-pushed." }
}
$branch = git branch --show-current
Assert-Exit 'Read branch'
if ($branch -ne 'main') { throw 'Switch to main before publishing these changes.' }
$remote = git remote get-url origin
Assert-Exit 'Read origin'
if ($remote -ne 'https://github.com/mhamzanadeem/crumb.git') { throw 'Unexpected origin remote. Review it before publishing.' }
git diff --cached --quiet
if ($LASTEXITCODE -ne 0) { throw 'There are already staged changes. Review/commit those first so this script does not publish unrelated staged files.' }
npm ci
Assert-Exit 'Install locked dependencies'
npm test
Assert-Exit 'Tests'
npm run build
Assert-Exit 'Production build'
git add -- .env.example .gitignore .vercelignore README.md VERCEL_SETUP.md APIMATIC_INTEGRATION.md SUBMISSION_UPDATES.md Publish-APIMatic.ps1 package.json package-lock.json next.config.mjs components/CrumbApp.js lib/paypal.js lib/paypal-apimatic.js lib/cli/paypal-check.js tests/paypal-apimatic.test.js tests/workflow.test.js
Assert-Exit 'Stage integration files'
git diff --cached --quiet
if ($LASTEXITCODE -eq 1) {
    git commit -m 'Complete APIMatic PayPal SDK integration and submission documentation'
    Assert-Exit 'Commit'
} elseif ($LASTEXITCODE -ne 0) { throw 'Could not inspect staged changes.' }
git push -u origin main
Assert-Exit 'Push to origin/main'
Write-Host 'Published main. Set PAYPAL_TRANSPORT=apimatic in Vercel and redeploy.'
