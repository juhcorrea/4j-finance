# Compacta somente o HTML público autossuficiente, sem copiar pastas do workspace.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$portfolioRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$portfolioWorkspace = [System.IO.Path]::GetFullPath((Join-Path $portfolioRoot '..'))
$portfolioHtml = Join-Path $portfolioWorkspace '4j-finance-portfolio-compartilhar.html'
$portfolioZip = Join-Path $portfolioWorkspace '4j-finance-portfolio-compartilhar.zip'
$portfolioStageZip = Join-Path $PSScriptRoot 'portfolio-public-only.zip'
if (-not (Test-Path -LiteralPath $portfolioHtml -PathType Leaf)) { throw 'Gere o HTML compartilhável primeiro.' }
$portfolioStream = [System.IO.File]::Open($portfolioStageZip, [System.IO.FileMode]::Create)
try {
    $portfolioArchive = New-Object System.IO.Compression.ZipArchive($portfolioStream, [System.IO.Compression.ZipArchiveMode]::Create, $true)
    try {
        [void][System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($portfolioArchive, $portfolioHtml, 'index.html', [System.IO.Compression.CompressionLevel]::Optimal)
    } finally { $portfolioArchive.Dispose() }
} finally { $portfolioStream.Dispose() }
$portfolioArchive = [System.IO.Compression.ZipFile]::OpenRead($portfolioStageZip)
try {
    if ($portfolioArchive.Entries.Count -ne 1 -or $portfolioArchive.Entries[0].FullName -ne 'index.html') { throw 'O ZIP deve conter somente index.html.' }
    $portfolioEntry = $portfolioArchive.Entries[0].Open()
    $portfolioSha = [System.Security.Cryptography.SHA256]::Create()
    try { $portfolioEntryHash = [BitConverter]::ToString($portfolioSha.ComputeHash($portfolioEntry)).Replace('-', '') }
    finally { $portfolioEntry.Dispose(); $portfolioSha.Dispose() }
    $portfolioHtmlStream = [System.IO.File]::OpenRead($portfolioHtml)
    $portfolioHtmlSha = [System.Security.Cryptography.SHA256]::Create()
    try { $portfolioHtmlHash = [BitConverter]::ToString($portfolioHtmlSha.ComputeHash($portfolioHtmlStream)).Replace('-', '') }
    finally { $portfolioHtmlStream.Dispose(); $portfolioHtmlSha.Dispose() }
    if ($portfolioEntryHash -ne $portfolioHtmlHash) { throw 'O ZIP não corresponde ao HTML atual.' }
} finally { $portfolioArchive.Dispose() }
# Destino exato e público; jamais mover/compactar uma pasta inteira.
if ([System.IO.Path]::GetFullPath($portfolioZip) -ne (Join-Path $portfolioWorkspace '4j-finance-portfolio-compartilhar.zip')) { throw 'Destino inesperado.' }
[System.IO.File]::Copy($portfolioStageZip, $portfolioZip, $true)
Write-Output 'ZIP atualizado: somente index.html, idêntico ao HTML compartilhável.'