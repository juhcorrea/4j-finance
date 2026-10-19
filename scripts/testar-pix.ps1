# Entrada privada para uma credencial de TESTE. Não salva a credencial.
[CmdletBinding()]
param([string]$NodePath)
$ErrorActionPreference = 'Stop'
if (-not $NodePath) {
  $nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
  if ($nodeCommand) { $NodePath = $nodeCommand.Source }
  else { $NodePath = Join-Path $env:USERPROFILE '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' }
}
if (-not (Test-Path -LiteralPath $NodePath -PathType Leaf)) { throw 'Node.js não encontrado.' }
$scriptPath = Join-Path $PSScriptRoot 'pix-sandbox.cjs'
Write-Host ''
Write-Host '4J Finance - teste do Pix de R$ 5, sem dinheiro real' -ForegroundColor Cyan
Write-Host 'Copie o Access Token NOVO de Credenciais de teste no Mercado Pago.'
Write-Host 'Cole abaixo. O valor ficará oculto e não será salvo.'
Write-Host 'O programa recusa contas de produção antes de criar qualquer order.'
$secureToken = Read-Host 'Access Token de TESTE' -AsSecureString
$pointer = [IntPtr]::Zero
$plainToken = $null
try {
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
  $plainToken = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  $info = New-Object System.Diagnostics.ProcessStartInfo
  $info.FileName = $NodePath
  $info.Arguments = '"' + $scriptPath + '" --stdin'
  $info.UseShellExecute = $false
  $info.CreateNoWindow = $true
  $info.RedirectStandardInput = $true
  $info.RedirectStandardOutput = $true
  $info.RedirectStandardError = $true
  $info.StandardOutputEncoding = [Text.Encoding]::UTF8
  $info.StandardErrorEncoding = [Text.Encoding]::UTF8
  $process = New-Object System.Diagnostics.Process
  $process.StartInfo = $info
  [void]$process.Start()
  $stdoutTask = $process.StandardOutput.ReadToEndAsync()
  $stderrTask = $process.StandardError.ReadToEndAsync()
  $process.StandardInput.Write($plainToken)
  $process.StandardInput.Close()
  $plainToken = $null
  $process.WaitForExit()
  $safeOutput = $stdoutTask.GetAwaiter().GetResult()
  $safeError = $stderrTask.GetAwaiter().GetResult()
  if ($safeOutput) { Write-Host $safeOutput.TrimEnd() }
  if ($safeError) { Write-Host $safeError.TrimEnd() -ForegroundColor Yellow }
  if ($process.ExitCode -ne 0) { throw 'Teste não concluído. Confira se a credencial é de teste; não envie seu valor pelo chat.' }
} finally {
  $plainToken = $null
  if ($pointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
  $secureToken.Dispose()
}
