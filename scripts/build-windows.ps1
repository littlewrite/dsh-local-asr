$ErrorActionPreference = 'Stop'

$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$project = Join-Path $root 'native/windows/SpeechRecognizer.csproj'
$output = Join-Path $root 'native/windows/bin/Release/net472/dsh-voice-windows.exe'
$target = Join-Path $root 'native/windows/dsh-voice-windows.exe'

$msbuild = Get-Command msbuild -ErrorAction SilentlyContinue
if ($null -ne $msbuild) {
    & $msbuild.Source $project /t:Build /p:Configuration=Release /p:Platform='Any CPU'
} else {
    $dotnet = Get-Command dotnet -ErrorAction SilentlyContinue
    if ($null -eq $dotnet) {
        throw 'Neither msbuild nor dotnet was found. Install the .NET Framework developer tools.'
    }
    & $dotnet.Source build $project --configuration Release
}

if (-not (Test-Path -LiteralPath $output)) {
    throw "Build succeeded but the expected helper was not found at $output"
}

Copy-Item -LiteralPath $output -Destination $target -Force
Write-Output $target
