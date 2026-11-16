# One-command setup and check-up of a game repository on the owner's Windows PC.
#
#   powershell -ExecutionPolicy Bypass -File kit\tooling-scripts\setup.ps1 -Name "My game" -RepoUrl https://github.com/<owner>/<repo> -Dir C:\<folder>
# Add -CheckOnly to only check, without installing, cloning, stopping or building anything.
#
# It checks Git (and that a name and e-mail are set for commits) and Node.js (offering winget when one is missing), updates
# the repository (or clones it into -Dir), stops node processes left over from the folder (they lock files and make npm ci
# fail with EPERM), installs the npm packages (and Playwright's Chromium with -Playwright), checks Python 3 and the
# -PipModules (with -Python), runs the -Build npm scripts and the -Check one, checks the self-hosted runner in WSL (with
# -RunnerRepo and -RunnerLabel), then ends with a numbered list of what is still to do. Safe to run again.
# A list (-Need, -Build, -PipModules) is given with commas: -Build content:build,art:build
# (ASCII only: Windows PowerShell 5.1 reads a script without a byte-order mark in the system code page.)

param(
    [string]$Name = 'Game',
    [string]$RepoUrl = '',
    [string]$Dir = '',
    [string]$Marker = 'package.json',
    [int]$NodeMajor = 22,
    [string[]]$Need = @(),
    [switch]$Playwright,
    [switch]$Python,
    [string[]]$PipModules = @(),
    [string[]]$Build = @(),
    [string]$Check = 'check',
    [string]$RunnerRepo = '',
    [string]$RunnerLabel = '',
    [string]$RunnerEnv = '',
    [string]$RunnerInstaller = 'kit/ci-templates/install-wsl.sh',
    [string]$Ready = '',
    [switch]$CheckOnly
)

$ErrorActionPreference = 'Continue'
$todo = New-Object System.Collections.Generic.List[string]
function Split-List($v) { @($v | ForEach-Object { $_ -split ',' } | Where-Object { $_ }) }
$Need = Split-List $Need
$Build = Split-List $Build
$PipModules = Split-List $PipModules

function Ok($msg)   { Write-Host "  OK    $msg" -ForegroundColor Green }
function Info($msg) { Write-Host "  INFO  $msg" -ForegroundColor Cyan }
function Todo($msg) { Write-Host "  TODO  $msg" -ForegroundColor Yellow; $script:todo.Add($msg) }
function Has($cmd)  { [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }
function Refresh-Path {
    $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
}

Write-Host ""
Write-Host "$Name setup" -ForegroundColor White
Write-Host ""

# --- 1. Git and Node.js ----------------------------------------------------------------------------------------------
Write-Host "Git and Node.js"
if (-not (Has git) -and -not $CheckOnly -and (Has winget)) {
    Info "installing Git (winget install Git.Git)"
    winget install --id Git.Git -e --source winget --accept-package-agreements --accept-source-agreements
    Refresh-Path
}
if (Has git) {
    Ok ((git --version) | Out-String).Trim()
    $gitName = ((git config --global user.name) | Out-String).Trim()
    $gitMail = ((git config --global user.email) | Out-String).Trim()
    if ($gitName -and $gitMail) { Ok "Git commits as $gitName <$gitMail>" }
    else { Todo "Tell Git who you are (once): git config --global user.name `"Your Name`"   and   git config --global user.email `"you@example.com`"" }
} else { Todo "Install Git: winget install --id Git.Git -e   then open a new PowerShell window." }

$nodeOk = $false
if (-not (Has node) -and -not $CheckOnly -and (Has winget)) {
    Info "installing Node.js LTS (winget install OpenJS.NodeJS.LTS)"
    winget install --id OpenJS.NodeJS.LTS -e --source winget --accept-package-agreements --accept-source-agreements
    Refresh-Path
}
if (Has node) {
    $v = ((node --version) | Out-String).Trim()
    $major = 0
    [void][int]::TryParse(($v -replace '^v', '').Split('.')[0], [ref]$major)
    if ($major -ge $NodeMajor) { Ok "node $v"; $nodeOk = $true }
    else { Todo "Node.js $v is too old: winget install --id OpenJS.NodeJS.LTS -e   then open a new PowerShell window." }
} else {
    Todo "Install Node.js $NodeMajor LTS: winget install --id OpenJS.NodeJS.LTS -e   then open a new PowerShell window."
}

# --- 2. The repository -----------------------------------------------------------------------------------------------
Write-Host "Repository"
$here = Test-Path -LiteralPath $Marker
if (-not $here -and $Dir) {
    if (Test-Path -LiteralPath (Join-Path $Dir $Marker)) { Set-Location $Dir; $here = $true }
    elseif ($RepoUrl -and (Has git) -and -not $CheckOnly) {
        Info "cloning $RepoUrl into $Dir"
        New-Item -ItemType Directory -Force (Split-Path $Dir) | Out-Null
        git clone $RepoUrl $Dir
        if ($LASTEXITCODE -eq 0) { Set-Location $Dir; $here = $true }
    }
}
if (-not $here) {
    if ($RepoUrl -and $Dir) { Todo "Clone the repository: git clone $RepoUrl `"$Dir`"" }
    else { Todo "Run this script from the repository folder, or give -RepoUrl and -Dir." }
} else {
    Ok "folder: $((Get-Location).Path)"
    if ((Has git) -and -not $CheckOnly) {
        $branch = ((git rev-parse --abbrev-ref HEAD) | Out-String).Trim()
        $dirty = ((git status --porcelain --untracked-files=no) | Out-String).Trim()
        if ($branch -eq 'main' -and -not $dirty) {
            git pull --ff-only
            if ($LASTEXITCODE -eq 0) { Ok "main is up to date" }
            else { Todo "git pull failed: copy its last lines into the chat." }
        } else {
            Info "not updating: on branch '$branch'$(if ($dirty) { ' with local changes' })"
        }
    }
    foreach ($n in $Need) {
        if (Test-Path -LiteralPath $n) { Ok "$n is present" }
        else { Todo "$n is missing: update the repository (git pull)." }
    }
}

# --- 3. Stale node processes, npm packages and Playwright's Chromium --------------------------------------------------
Write-Host "npm packages"
$packagesOk = $false
if ($here -and $nodeOk) {
    # A dev server or test run left over from this folder keeps files in node_modules open, and npm ci then fails with EPERM.
    $root = (Get-Location).Path
    $stale = @(Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -and $_.CommandLine -match ([regex]::Escape($root.TrimEnd('\')) + '([\\/"'']|$)') })
    if ($stale.Count -eq 0) { Ok "no leftover node processes from this folder" }
    elseif ($CheckOnly) { Todo "Stop $($stale.Count) node process(es) left over from this folder: Get-Process node | Stop-Process   (or close the windows running the game)." }
    else {
        foreach ($p in $stale) { Info "stopping node process $($p.ProcessId)"; Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue }
        Ok "stopped $($stale.Count) leftover node process(es)"
    }

    $needInstall = -not (Test-Path -LiteralPath 'node_modules\.package-lock.json')
    if (-not $needInstall) {
        $needInstall = (Get-Item -LiteralPath 'package-lock.json').LastWriteTime -gt (Get-Item -LiteralPath 'node_modules\.package-lock.json').LastWriteTime
    }
    if (-not $needInstall) { Ok "npm packages are installed and up to date"; $packagesOk = $true }
    elseif ($CheckOnly) { Todo "Install the npm packages: npm ci" }
    else {
        Info "installing the npm packages (npm ci; a few minutes the first time)"
        npm ci --no-audit --no-fund
        if ($LASTEXITCODE -eq 0) { Ok "npm packages installed"; $packagesOk = $true }
        else { Todo "npm ci failed. If it says EPERM: close the game (Ctrl+C in its window), the editor and any other terminal using this folder, then run this script again." }
    }
    if ($Playwright -and $packagesOk -and -not $CheckOnly) {
        npx playwright install chromium
        if ($LASTEXITCODE -eq 0) { Ok "Playwright's Chromium is installed" }
        else { Todo "npx playwright install chromium failed: copy its last lines into the chat." }
    }
}

# --- 4. Python 3 and its modules -------------------------------------------------------------------------------------
if ($Python -or $PipModules.Count -gt 0) {
    Write-Host "Python 3"
    $py = $null
    foreach ($c in @('python', 'py')) {
        if (Has $c) {
            $out = if ($c -eq 'py') { (py -3 --version 2>&1 | Out-String) } else { (python --version 2>&1 | Out-String) }
            if ($out -match '^Python 3\.') { $py = $out.Trim(); break }
        }
    }
    if (-not $py -and -not $CheckOnly -and (Has winget)) {
        Info "installing Python 3.13 for all users (winget install Python.Python.3.13 --scope machine)"
        winget install --id Python.Python.3.13 -e --scope machine --source winget --accept-package-agreements --accept-source-agreements
        Refresh-Path
        if (Has py) { $out = (py -3 --version 2>&1 | Out-String); if ($out -match '^Python 3\.') { $py = $out.Trim() } }
    }
    if ($py) { Ok $py }
    else { Todo "Install Python 3 for all users: winget install --id Python.Python.3.13 -e --scope machine   then open a new PowerShell window." }
    if ($py) {
        $pyCmd = if (Has python) { 'python' } else { 'py' }
        $pyArgs = if ($pyCmd -eq 'py') { @('-3') } else { @() }
        foreach ($m in $PipModules) {
            & $pyCmd @pyArgs -c "import $m" 2>$null
            if ($LASTEXITCODE -ne 0 -and -not $CheckOnly) {
                Info "installing $m (python -m pip install --user $m)"
                & $pyCmd @pyArgs -m pip install --user $m
                & $pyCmd @pyArgs -c "import $m" 2>$null
            }
            if ($LASTEXITCODE -eq 0) { Ok "$m is installed" }
            else { Todo "Install ${m}: python -m pip install --user $m" }
        }
    }
}

# --- 5. Build scripts and the check ----------------------------------------------------------------------------------
Write-Host "Build and checks"
if ($packagesOk) {
    $scripts = (Get-Content -Raw -LiteralPath 'package.json' | ConvertFrom-Json).scripts
    foreach ($s in $Build) {
        if (-not ($scripts.PSObject.Properties.Name -contains $s)) { Info "npm run $s does not exist yet"; continue }
        if ($CheckOnly) { Info "skipped npm run $s (-CheckOnly)"; continue }
        npm run $s
        if ($LASTEXITCODE -eq 0) { Ok "npm run $s" } else { Todo "npm run $s failed: copy its last lines into the chat." }
    }
    if (-not $Check) { }
    elseif ($CheckOnly) { Info "skipped npm run $Check (-CheckOnly)" }
    else {
        Info "running npm run $Check"
        npm run $Check
        if ($LASTEXITCODE -eq 0) { Ok "npm run $Check is green" }
        else { Todo "npm run $Check failed: copy its last 40 lines into the chat." }
    }
}

# --- 6. The self-hosted runner (WSL Ubuntu) --------------------------------------------------------------------------
if ($here -and $RunnerRepo -and $RunnerLabel) {
    Write-Host "Runner (CI on this PC)"
    # these go into a bash command line: plain characters only
    $safe = '^[A-Za-z0-9_=\-./:]*$'
    if (@($RunnerRepo, $RunnerLabel, $RunnerInstaller) + @($RunnerEnv -split ' ') | Where-Object { $_ -cnotmatch $safe }) { Todo "-RunnerRepo, -RunnerLabel, -RunnerInstaller and -RunnerEnv (K=V pairs, one space apart) take only letters, digits and _ = - . / :" }
    elseif (-not (Has wsl.exe)) { Todo "WSL is not installed: wsl --install -d Ubuntu   then run this script again." }
    else {
        # the repository folder as WSL sees it: X:\a\b -> /mnt/x/a/b
        $cwd = (Get-Location).Path
        $wslPath = '/mnt/' + $cwd.Substring(0, 1).ToLower() + $cwd.Substring(2).Replace([string][char]92, '/')
        $installer = ("RUNNER_REPO=$RunnerRepo RUNNER_LABEL=$RunnerLabel $RunnerEnv").Trim() + " bash $wslPath/$RunnerInstaller"
        $report = (& wsl.exe -d Ubuntu -- bash -lc "$installer --check" 2>&1 | Out-String)
        if ($LASTEXITCODE -eq 0) { Ok "the $RunnerLabel runner is installed and active" }
        else {
            Todo "Install the runner (once, after the GitHub repository exists): wsl.exe -d Ubuntu -- bash -lc `"$installer`""
            if ($report.Trim()) { Info (($report.Trim() -split "`n") | Select-Object -Last 2 | Out-String).Trim() }
        }
    }
}

# --- 7. Summary ------------------------------------------------------------------------------------------------------
Write-Host ""
if ($todo.Count -eq 0) {
    Write-Host ("Ready. $Ready").Trim() -ForegroundColor Green
} else {
    Write-Host "Still to do:" -ForegroundColor Yellow
    $i = 1
    foreach ($t in $todo) { Write-Host "  $i. $t"; $i++ }
    Write-Host "Then run this script again."
}
Write-Host ""
