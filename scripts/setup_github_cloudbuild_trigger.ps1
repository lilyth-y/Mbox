# One-time: GitHub repo -> Cloud Build trigger for mbox (newmedia-496107 defaults).
# Usage:
#   $env:GITHUB_OWNER = "your-github-user"
#   $env:GITHUB_REPO  = "TheHoloVision"
#   .\scripts\setup_github_cloudbuild_trigger.ps1
#
# Prereqs: gcloud auth, project newmedia-496107 (or set GCLOUD_PROJECT).

$ErrorActionPreference = "Stop"

$ProjectId = if ($env:GCLOUD_PROJECT) { $env:GCLOUD_PROJECT } else { "newmedia-496107" }
$Region = if ($env:MBOX_REGION) { $env:MBOX_REGION } else { "asia-northeast3" }
$ConnectionName = if ($env:MBOX_GITHUB_CONNECTION) { $env:MBOX_GITHUB_CONNECTION } else { "mbox-github" }
$TriggerName = if ($env:MBOX_TRIGGER_NAME) { $env:MBOX_TRIGGER_NAME } else { "mbox-deploy-master" }
$BranchPattern = if ($env:MBOX_BRANCH_PATTERN) { $env:MBOX_BRANCH_PATTERN } else { "^(master|main)$" }
$GitHubOwner = if ($env:GITHUB_OWNER) { $env:GITHUB_OWNER } else { "lilyth-y" }
$GitHubRepo = if ($env:GITHUB_REPO) { $env:GITHUB_REPO } else { "Mbox" }

if (-not $GitHubOwner -or -not $GitHubRepo) {
  Write-Host @"
Set GitHub coordinates before running:

  `$env:GITHUB_OWNER = 'your-github-username-or-org'
  `$env:GITHUB_REPO  = 'TheHoloVision'
  .\scripts\setup_github_cloudbuild_trigger.ps1

Also push this repo to GitHub first:

  git remote add origin https://github.com/`$env:GITHUB_OWNER/`$env:GITHUB_REPO.git
  git push -u origin master
"@
  exit 1
}

Write-Host "Project=$ProjectId Region=$Region Connection=$ConnectionName Trigger=$TriggerName"
gcloud config set project $ProjectId | Out-Null

$projectNumber = (gcloud projects describe $ProjectId --format="value(projectNumber)").Trim()
$cbSa = "${projectNumber}@cloudbuild.gserviceaccount.com"
Write-Host "Cloud Build SA: $cbSa"

Write-Host "Granting Secret Manager accessor on mbox-api-key to Cloud Build SA..."
gcloud secrets add-iam-policy-binding mbox-api-key `
  --member="serviceAccount:$cbSa" `
  --role="roles/secretmanager.secretAccessor" 2>$null | Out-Null

$connPath = "projects/$ProjectId/locations/$Region/connections/$ConnectionName"
$connJson = gcloud builds connections describe $ConnectionName --region=$Region --project=$ProjectId --format=json 2>$null
if (-not $connJson) {
  Write-Host @"

=== Step A: Create GitHub connection (browser) ===
Run this command and open the printed URL to authorize GitHub + install the Cloud Build app:

  gcloud builds connections create github $ConnectionName --region=$Region --project=$ProjectId

When describe shows installationState COMPLETE, re-run this script.
"@
  exit 2
}

$stage = (gcloud builds connections describe $ConnectionName --region=$Region --project=$ProjectId --format="value(installationState.stage)" 2>$null).Trim()
if ($stage -ne "COMPLETE") {
  $actionUri = (gcloud builds connections describe $ConnectionName --region=$Region --project=$ProjectId --format="value(installationState.actionUri)" 2>$null).Trim()
  Write-Host "`nConnection stage: $stage (need COMPLETE).`n"
  if ($actionUri) { Write-Host "Open this URL to finish GitHub OAuth + app install:`n$actionUri`n" }
  exit 3
}

$repoResourceName = if ($env:MBOX_REPOSITORY_ID) { $env:MBOX_REPOSITORY_ID } else { "lilyth-y-mbox" }
$remoteUri = "https://github.com/${GitHubOwner}/${GitHubRepo}.git"
Write-Host "Linking repository $remoteUri as $repoResourceName ..."

$repoList = gcloud builds repositories list --connection=$ConnectionName --region=$Region --project=$ProjectId --format="value(name)" 2>$null
$fullRepo = "projects/$ProjectId/locations/$Region/connections/$ConnectionName/repositories/$repoResourceName"
if ($repoList -notmatch $repoResourceName) {
  gcloud builds repositories create $repoResourceName `
    --connection=$ConnectionName `
    --region=$Region `
    --project=$ProjectId `
    --remote-uri=$remoteUri
}

$existing = gcloud builds triggers list --region=$Region --project=$ProjectId --filter="name:$TriggerName" --format="value(name)"
if ($existing) {
  Write-Host "Trigger already exists: $TriggerName"
  gcloud builds triggers describe $TriggerName --region=$Region --project=$ProjectId
  exit 0
}

Write-Host "Creating trigger on branch $BranchPattern ..."
gcloud builds triggers create github `
  --name=$TriggerName `
  --region=$Region `
  --project=$ProjectId `
  --repository="projects/$ProjectId/locations/$Region/connections/$ConnectionName/repositories/$repoResourceName" `
  --branch-pattern=$BranchPattern `
  --build-config=cloudbuild.yaml `
  --description="Deploy mbox web (GCS) + API (Cloud Run) on push to master"

Write-Host "Done. Push to master to run:"
Write-Host "  git push origin master"
gcloud builds triggers describe $TriggerName --region=$Region --project=$ProjectId
