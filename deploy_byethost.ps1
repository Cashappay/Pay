# ==============================================================
# ByetHost Automated Deployment Script
# Target: cashapp.byethost5.com (/htdocs/)
# ==============================================================

$ftpBase = "ftp://ftpupload.net/htdocs"
$username = "b5_43298700"
# NOTE: Must use single quotes to avoid PowerShell expanding $7kuAh_ as a variable!
$password = '4UF3$7kuAh_*ZiF'
$credentials = New-Object System.Net.NetworkCredential($username, $password)
$localFolder = (Resolve-Path "vistapanel_cpanel_deploy").Path

Write-Output "=========================================================="
Write-Output "BYETHOST DEPLOYMENT UTILITY"
Write-Output "Target: cashapp.byethost5.com (/htdocs/)"
Write-Output "Local Package: $localFolder"
Write-Output "=========================================================="

function Ensure-RemoteDir($dirPath) {
    $remoteUrl = "$ftpBase/$dirPath"
    try {
        $req = [System.Net.FtpWebRequest]::Create($remoteUrl)
        $req.Credentials = $credentials
        $req.Method = [System.Net.WebRequestMethods+Ftp]::MakeDirectory
        $req.UsePassive = $true
        $req.KeepAlive = $false
        $req.Timeout = 12000
        $resp = $req.GetResponse()
        $resp.Close()
        Write-Output "[DIR CREATED] $dirPath"
    } catch {
        # Directory usually already exists (550), which is normal
        Write-Output "[DIR READY] $dirPath"
    }
    Start-Sleep -Seconds 1
}

function Upload-FileWithWebClient($localFilePath, $remoteRelativePath) {
    $remoteUrl = "$ftpBase/$remoteRelativePath"
    $maxAttempts = 3
    
    for ($attempt = 1; $attempt -le $maxAttempts; $attempt++) {
        try {
            $wc = New-Object System.Net.WebClient
            $wc.Credentials = $credentials
            $wc.UploadFile($remoteUrl, $localFilePath) | Out-Null
            $wc.Dispose()
            $size = (Get-Item $localFilePath).Length
            Write-Output "[SUCCESS] Uploaded: $remoteRelativePath ($size bytes)"
            Start-Sleep -Milliseconds 1200
            return $true
        } catch {
            Write-Output "[WARN] Attempt $attempt failed for $remoteRelativePath ($($_.Exception.Message))"
            Start-Sleep -Seconds 3
        }
    }
    Write-Output "[ERROR] Failed to upload $remoteRelativePath after $maxAttempts attempts."
    return $false
}

# Step 1: Ensure remote subdirectories exist
Write-Output "`n--> Step 1: Verifying remote directory structure..."
Ensure-RemoteDir "assets"
Ensure-RemoteDir "api"
Ensure-RemoteDir "data"

# Step 2: Upload all package files
Write-Output "`n--> Step 2: Uploading files to ByetHost /htdocs/..."
$allFiles = Get-ChildItem -Path $localFolder -Recurse -Force | Where-Object { -not $_.PSIsContainer }

$successCount = 0
$failCount = 0

foreach ($file in $allFiles) {
    if ($file.Name -eq "DEPLOY_GUIDE.md") {
        continue
    }
    $rel = $file.FullName.Substring($localFolder.Length).Replace("\", "/").TrimStart("/")
    $ok = Upload-FileWithWebClient $file.FullName $rel
    if ($ok) {
        $successCount++
    } else {
        $failCount++
    }
}

Write-Output "`n=========================================================="
if ($failCount -eq 0) {
    Write-Output "DEPLOYMENT COMPLETE! All $successCount files uploaded successfully!"
    Write-Output "Website is live at: http://cashapp.byethost5.com"
} else {
    Write-Output "Deployment finished with $successCount succeeded and $failCount failed."
}
Write-Output "=========================================================="
