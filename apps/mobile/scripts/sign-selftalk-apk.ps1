param(
  [Parameter(Mandatory = $true)][string]$UnsignedApk,
  [Parameter(Mandatory = $true)][string]$ApkSignerJar,
  [Parameter(Mandatory = $true)][string]$OutputApk,
  [Parameter(Mandatory = $true)][string]$ExpectedApkSha256,
  [Parameter(Mandatory = $true)][string]$ExpectedSignerSha256
)

$ErrorActionPreference = 'Stop'
$apkPath = (Resolve-Path -LiteralPath $UnsignedApk).Path
$signerPath = (Resolve-Path -LiteralPath $ApkSignerJar).Path
$outputPath = [IO.Path]::GetFullPath($OutputApk)
if (Test-Path -LiteralPath $outputPath) { throw 'Refusing to overwrite an existing APK.' }
if ((Get-FileHash -LiteralPath $apkPath -Algorithm SHA256).Hash -ne $ExpectedApkSha256) {
  throw 'Unsigned APK checksum mismatch.'
}
if ((Get-FileHash -LiteralPath $signerPath -Algorithm SHA256).Hash -ne $ExpectedSignerSha256) {
  throw 'APK signer checksum mismatch.'
}

$javaPath = (Get-Command java.exe -ErrorAction Stop).Source
$keytoolPath = Join-Path (Split-Path $javaPath) 'keytool.exe'
if (!(Test-Path -LiteralPath $keytoolPath)) { throw 'Existing Java installation has no keytool.' }

# Keep the private signing identity outside the repository. The password is
# protected by Windows DPAPI for this Windows user, never logged or uploaded.
$signingDir = Join-Path $env:LOCALAPPDATA 'SelfTalk\android-signing'
[IO.Directory]::CreateDirectory($signingDir) | Out-Null
$sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
& icacls.exe $signingDir /inheritance:r /grant:r "*${sid}:(OI)(CI)F" '*S-1-5-18:(OI)(CI)F' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Could not restrict access to the signing directory.' }
$keystore = Join-Path $signingDir 'selftalk-release.p12'
$protectedPassword = Join-Path $signingDir 'password.dpapi'
$hasKey = Test-Path -LiteralPath $keystore
$hasPassword = Test-Path -LiteralPath $protectedPassword
if ($hasKey -ne $hasPassword) { throw 'Incomplete signing identity; refusing to replace it.' }

$priorPassword = $env:SELFTALK_SIGNING_PASSWORD
try {
  if ($hasKey) {
    $secure = Get-Content -LiteralPath $protectedPassword -Raw | ConvertTo-SecureString
    $env:SELFTALK_SIGNING_PASSWORD = [Net.NetworkCredential]::new('', $secure).Password
  } else {
    $bytes = [byte[]]::new(48)
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
    $env:SELFTALK_SIGNING_PASSWORD = [Convert]::ToBase64String($bytes)
    $secure = ConvertTo-SecureString $env:SELFTALK_SIGNING_PASSWORD -AsPlainText -Force
    $encrypted = ConvertFrom-SecureString $secure
    [IO.File]::WriteAllText($protectedPassword, $encrypted)
    & $keytoolPath -genkeypair -keystore $keystore -storetype PKCS12 `
      -alias selftalk -keyalg RSA -keysize 3072 -validity 10000 `
      -dname 'CN=SelfTalk Android, OU=Personal Build' `
      -storepass:env SELFTALK_SIGNING_PASSWORD -keypass:env SELFTALK_SIGNING_PASSWORD
    if ($LASTEXITCODE -ne 0) { throw 'Could not generate signing identity; preserve files for inspection.' }
  }
  [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($outputPath)) | Out-Null
  & $javaPath -jar $signerPath sign --ks $keystore --ks-key-alias selftalk `
    --ks-pass env:SELFTALK_SIGNING_PASSWORD --key-pass env:SELFTALK_SIGNING_PASSWORD `
    --v4-signing-enabled false --out $outputPath $apkPath
  if ($LASTEXITCODE -ne 0) { throw 'APK signing failed.' }
  & $javaPath -jar $signerPath verify --verbose --print-certs $outputPath
  if ($LASTEXITCODE -ne 0) { throw 'APK signature verification failed; do not install.' }
  Get-FileHash -LiteralPath $outputPath -Algorithm SHA256
} finally {
  $env:SELFTALK_SIGNING_PASSWORD = $priorPassword
}
