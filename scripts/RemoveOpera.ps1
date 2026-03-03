# ============================================================
# Intune Remediation (SYSTEM) — Opera removal (NO uninstall execution)
# Removes Opera / Opera GX / Beta / Developer footprints without launching UI
# - No UninstallString / QuietUninstallString execution (prevents GUI popups)
# Logs: C:\ProgramData\Intune\Logs\OperaRemoval\remediation.log
# Exit 0 always
# ============================================================

$ErrorActionPreference = "Continue"

$LogDir  = "C:\ProgramData\Intune\Logs\OperaRemoval"
$LogFile = Join-Path $LogDir "remediation.log"
New-Item -ItemType Directory -Path $LogDir -Force | Out-Null

function Log($m){
    $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') - $m"
    Add-Content -Path $LogFile -Value $line
    Write-Host $line
}

Log "============================================================"
Log "Opera removal starting (NO uninstall execution)"
Log "Running as: $(whoami)"
Log "============================================================"

# ---------- Stop processes ----------
function Stop-OperaProcesses {
    $names = @(
        "opera","opera_autoupdate","opera_crashreporter",
        "opera_gx","opera_gx_autoupdate","opera_gx_crashreporter",
        "opera_browser_assistant","opera_browser_assistant64"
    )
    foreach ($n in $names) {
        Get-Process -Name $n -ErrorAction SilentlyContinue | ForEach-Object {
            Log "Stopping process: $($_.Name) (PID $($_.Id))"
            Stop-Process $_ -Force -ErrorAction SilentlyContinue
        }
    }
}

# ---------- Enumerate real profiles ----------
function Get-RealUserProfiles {
    $exclude = @("Public","Default","Default User","All Users","defaultuser0","WDAGUtilityAccount")
    @(
        Get-ChildItem C:\Users -Directory -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -notin $exclude } |
        ForEach-Object {
            $nt = Join-Path $_.FullName "NTUSER.DAT"
            if (Test-Path $nt) {
                [PSCustomObject]@{
                    Name   = $_.Name
                    Path   = $_.FullName
                    NtUser = $nt
                }
            }
        }
    )
}

# ---------- Map profile path -> SID (for logged-in hive cleanup) ----------
function Get-ProfileSid($profilePath) {
    try {
        $p = Get-CimInstance Win32_UserProfile -ErrorAction SilentlyContinue |
             Where-Object { $_.LocalPath -eq $profilePath }
        return $p.SID
    } catch {
        return $null
    }
}

# ---------- Remove per-user folders ----------
function Remove-OperaFoldersPerUser($profile){

    $u = $profile.Name
    $base = $profile.Path

    $folders = @(
        "$base\AppData\Local\Programs\Opera",
        "$base\AppData\Local\Programs\Opera GX",
        "$base\AppData\Local\Programs\Opera Beta",
        "$base\AppData\Local\Programs\Opera Developer",
        "$base\AppData\Roaming\Opera Software",
        "$base\AppData\Local\Opera Software"
    )

    foreach ($f in $folders){
        if (Test-Path $f){
            Log "[$u] Removing folder: $f"
            Remove-Item $f -Recurse -Force -ErrorAction SilentlyContinue
        }
    }
}

# ---------- Registry cleanup core (works on any hive root passed in) ----------
function Remove-OperaRegistryInHive([string]$HiveRoot, [string]$UserName) {

    $roots = @(
        "$HiveRoot\Software\Microsoft\Windows\CurrentVersion\Uninstall",
        "$HiveRoot\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall"
    )

    foreach ($root in $roots){
        if (-not (Test-Path $root)){ continue }

        Get-ChildItem $root -ErrorAction SilentlyContinue | ForEach-Object {
            $p = Get-ItemProperty $_.PSPath -ErrorAction SilentlyContinue
            if ($p.DisplayName -match '(?i)\bopera\b'){
                Log "[$UserName] Removing uninstall key: $($_.PSChildName)"
                Remove-Item $_.PSPath -Recurse -Force -ErrorAction SilentlyContinue
            }
        }
    }

    $vendor = "$HiveRoot\Software\Opera Software"
    if (Test-Path $vendor){
        Log "[$UserName] Removing vendor key"
        Remove-Item $vendor -Recurse -Force -ErrorAction SilentlyContinue
    }
}

# ---------- Remove per-user registry (logged-in OR offline) ----------
function Remove-OperaRegistryPerUser($profile){

    $u = $profile.Name

    # If the user is logged in, their hive is already loaded at HKU:\<SID>
    $sid = Get-ProfileSid $profile.Path
    if ($sid -and (Test-Path "Registry::HKEY_USERS\$sid")) {
        Log "[$u] Hive is loaded (user logged in). Cleaning HKU:\$sid directly."
        Remove-OperaRegistryInHive -HiveRoot "Registry::HKEY_USERS\$sid" -UserName $u
        return
    }

    # Otherwise, offline cleanup by loading NTUSER.DAT to a temp hive
    $temp = "TempHive_$u"

    # Suppress stderr so Intune doesn't mark remediation as failed due to reg.exe noise
    $null = & reg.exe load "HKU\$temp" "$($profile.NtUser)" 2>$null

    if ($LASTEXITCODE -ne 0){
        Log "[$u] Hive could not be loaded. Skipping per-user registry cleanup."
        return
    }

    Log "[$u] Hive loaded for per-user cleanup"
    Remove-OperaRegistryInHive -HiveRoot "Registry::HKEY_USERS\$temp" -UserName $u

    $null = & reg.exe unload "HKU\$temp" 2>$null
    Log "[$u] Hive unloaded"
}

# ---------- Remove machine-wide folders (NO uninstall execution) ----------
function Remove-OperaFoldersMachineWide {

    Log "---- Machine-wide folder cleanup starting (NO uninstall execution) ----"

    $folders = @(
        "$env:ProgramFiles\Opera",
        "$env:ProgramFiles\Opera GX",
        "$env:ProgramFiles\Opera Beta",
        "$env:ProgramFiles\Opera Developer",
        "${env:ProgramFiles(x86)}\Opera",
        "${env:ProgramFiles(x86)}\Opera GX",
        "${env:ProgramFiles(x86)}\Opera Beta",
        "${env:ProgramFiles(x86)}\Opera Developer",
        "$env:ProgramData\Opera Software"
    ) | Where-Object { $_ -and $_ -ne "" }

    foreach ($f in $folders) {
        if (Test-Path $f) {
            Log "[HKLM] Removing folder: $f"
            Remove-Item $f -Recurse -Force -ErrorAction SilentlyContinue
        }
    }

    Log "---- Machine-wide folder cleanup completed ----"
}

# ---------- Optional: Remove HKLM uninstall keys referencing Opera (NO uninstall execution) ----------
function Remove-OperaHKLMUninstallKeys {

    Log "---- HKLM uninstall key cleanup starting (NO uninstall execution) ----"

    $uninstallRoots = @(
        "Registry::HKEY_LOCAL_MACHINE\Software\Microsoft\Windows\CurrentVersion\Uninstall",
        "Registry::HKEY_LOCAL_MACHINE\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall"
    )

    foreach ($root in $uninstallRoots) {
        if (-not (Test-Path $root)) { continue }

        Get-ChildItem $root -ErrorAction SilentlyContinue | ForEach-Object {
            $keyPath = $_.PSPath
            $name    = $_.PSChildName
            $p = Get-ItemProperty $keyPath -ErrorAction SilentlyContinue

            if ($p.DisplayName -and ($p.DisplayName -match '(?i)\bopera\b')) {
                Log "[HKLM] Removing uninstall key for: $($p.DisplayName) ($name)"
                Remove-Item $keyPath -Recurse -Force -ErrorAction SilentlyContinue
            }
        }
    }

    # Remove vendor keys (best effort)
    $vendor1 = "Registry::HKEY_LOCAL_MACHINE\Software\Opera Software"
    $vendor2 = "Registry::HKEY_LOCAL_MACHINE\Software\WOW6432Node\Opera Software"

    if (Test-Path $vendor1) {
        Log "[HKLM] Removing vendor key: HKLM\Software\Opera Software"
        Remove-Item $vendor1 -Recurse -Force -ErrorAction SilentlyContinue
    }
    if (Test-Path $vendor2) {
        Log "[HKLM] Removing vendor key: HKLM\Software\WOW6432Node\Opera Software"
        Remove-Item $vendor2 -Recurse -Force -ErrorAction SilentlyContinue
    }

    Log "---- HKLM uninstall key cleanup completed ----"
}

# ---------- Execution ----------
Stop-OperaProcesses

# Machine-wide footprints (no uninstall execution)
Remove-OperaFoldersMachineWide
Remove-OperaHKLMUninstallKeys

# Per-user footprints
$profiles = Get-RealUserProfiles
Log "Found $($profiles.Count) real user profiles."

foreach ($p in $profiles){
    Log "---- Processing profile: $($p.Name) ----"
    Remove-OperaFoldersPerUser $p
    Remove-OperaRegistryPerUser $p
}

Stop-OperaProcesses

Log "Opera removal completed (NO uninstall execution)."
exit 0