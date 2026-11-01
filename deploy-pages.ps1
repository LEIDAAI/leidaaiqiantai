# Deploy via GitHub Contents API (git push blocked on 443 here; POST /git/trees
# is unreliable through this network, while flat one-file PUT/DELETE requests
# behave like the blob uploads that always succeeded).
# Usage: set $env:GH_TOKEN in outer shell, then dot-source this file.
# Branch 1: codex/radar-pages -> source files
# Branch 2: gh-pages          -> dist artifacts + stale asset cleanup
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$Repo = 'LEIDAAI/leidaaiqiantai'
$ApiBase = "https://api.github.com/repos/$Repo"

function Get-Token {
  if ($env:GH_TOKEN) { return $env:GH_TOKEN }
  $out = "protocol=https`nhost=github.com`n`n" | git credential fill 2>$null
  $line = $out | Where-Object { $_ -like 'password=*' }
  if (-not $line) { throw 'no github credential' }
  return $line.Substring(9)
}
$Token = Get-Token
$Headers = @{ Authorization = "Bearer $Token"; 'User-Agent' = 'deploy-script'; Accept = 'application/vnd.github+json' }

function ApiRetry($Method, $Path, $Body) {
  $a = @{ Method = $Method; Uri = "$ApiBase$Path"; Headers = $Headers; ContentType = 'application/json; charset=utf-8'; ErrorAction = 'Stop' }
  if ($Body) { $a.Body = [Text.Encoding]::UTF8.GetBytes(($Body | ConvertTo-Json -Depth 10 -Compress)) }
  for ($i = 1; $i -le 5; $i++) {
    try {
      $r = Invoke-RestMethod @a
      if ($null -ne $r) { return $r }
      Write-Host "API $Method $Path try$i EMPTY"
    } catch {
      $sc = 0
      try { $sc = [int]$_.Exception.Response.StatusCode } catch {}
      # GET returning 404 means the path does not exist yet (expected case)
      if ($Method -eq 'GET' -and $sc -eq 404) { return $null }
      Write-Host "API $Method $Path try$i FAIL (http $sc): $($_.Exception.Message)"
    }
    Start-Sleep -Seconds (3 * $i)
  }
  throw "API $Method $Path failed after 5 attempts"
}

function Set-File($Branch, $RemotePath, $LocalPath, $Msg) {
  $content = [Convert]::ToBase64String([IO.File]::ReadAllBytes($LocalPath))
  $existing = ApiRetry GET "/contents/${RemotePath}?ref=$Branch" $null
  $sha = $null
  if ($existing -and $existing.content) {
    $remoteB64 = ($existing.content -replace "`n", '')
    if ($remoteB64 -eq $content) { Write-Host "SKIP $RemotePath (unchanged)"; return }
    $sha = $existing.sha
  }
  $body = @{ message = $Msg; content = $content; branch = $Branch }
  if ($sha) { $body.sha = $sha }
  $r = ApiRetry PUT "/contents/${RemotePath}" $body
  $c = ''
  try { $c = $r.commit.sha.Substring(0, 7) } catch {}
  Write-Host "PUT $RemotePath ok (commit $c)"
}

function Remove-File($Branch, $RemotePath, $Msg) {
  $existing = ApiRetry GET "/contents/${RemotePath}?ref=$Branch" $null
  if (-not $existing) { Write-Host "DEL-SKIP $RemotePath (absent)"; return }
  $r = ApiRetry DELETE "/contents/${RemotePath}" @{ message = $Msg; sha = $existing.sha; branch = $Branch }
  Write-Host "DEL $RemotePath ok"
}

$Msg1 = 'feat: composer popover expert/skill picker + mobile adaptation'
$Msg2 = 'deploy: composer popover expert/skill picker + mobile adaptation'

# ---- 1. codex/radar-pages sources ----
foreach ($f in @('src/App.vue','src/components/ChatPane.vue','src/components/Composer.vue','src/components/Sidebar.vue','src/stores/chat.ts','src/stores/send.ts','src/styles/global.css')) {
  Set-File 'codex/radar-pages' $f (Join-Path (Get-Location) $f) $Msg1
}
# workflow file: skip silently if unchanged; warn+continue if token lacks scope
try {
  Set-File 'codex/radar-pages' '.github/workflows/pages.yml' (Join-Path (Get-Location) '.github/workflows/pages.yml') $Msg1
} catch { Write-Host "WARN workflow file skipped: $($_.Exception.Message)" }

# ---- 2. gh-pages dist ----
$distDir = Join-Path (Get-Location) 'dist'
Set-File 'gh-pages' 'index.html' (Join-Path $distDir 'index.html') $Msg2
Set-File 'gh-pages' 'favicon.png' (Join-Path $distDir 'favicon.png') $Msg2
$distAssets = Get-ChildItem (Join-Path $distDir 'assets')
foreach ($a in $distAssets) { Set-File 'gh-pages' "assets/$($a.Name)" $a.FullName $Msg2 }

# ---- 3. remove stale assets on gh-pages ----
$tree = $null
foreach ($i in 1..3) {
  try { $tree = ApiRetry GET '/git/trees/gh-pages?recursive=1' $null; if ($tree -and $tree.tree) { break } } catch {}
  Start-Sleep -Seconds 2
}
if ($tree -and $tree.tree) {
  $keep = @('index.html','favicon.png') + @($distAssets | ForEach-Object { "assets/$($_.Name)" })
  $stale = @($tree.tree | Where-Object { $_.path -like 'assets/*' -and $keep -notcontains $_.path } | ForEach-Object { $_.path })
  foreach ($p in $stale) { Remove-File 'gh-pages' $p $Msg2 }
} else {
  Write-Host 'WARN: could not list remote tree; stale assets left in place'
}

# ---- 4. report refs ----
$r1 = ApiRetry GET '/git/ref/heads/codex/radar-pages' $null
$r2 = ApiRetry GET '/git/ref/heads/gh-pages' $null
Write-Host "codex/radar-pages => $($r1.object.sha)"
Write-Host "gh-pages => $($r2.object.sha)"
Write-Host 'DEPLOY DONE'
