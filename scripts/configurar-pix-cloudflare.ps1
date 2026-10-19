# Configuração exclusiva do projeto Cloudflare Pages 4jfinance-pix-test.
# Não publica o site, não cria cobranças e não aceita segredos como argumentos.
$ErrorActionPreference = 'Stop'
$setupExitCode = 1
$setupStage = 'WRAPPER_NODE_LOOKUP'
$setupSafeStages = @('WRAPPER_NODE_LOOKUP', 'WRAPPER_SCRIPT_LOOKUP',
    'WRAPPER_SECURE_INPUT', 'WRAPPER_PROCESS_CONFIG', 'WRAPPER_PROCESS_START',
    'WRAPPER_INPUT_WRITE', 'WRAPPER_PROCESS_WAIT', 'WRAPPER_RESULT_PARSE')
$setupProcess = $null
$setupAccessSecure = $null
$setupWebhookSecure = $null
$setupAccessPtr = [IntPtr]::Zero
$setupWebhookPtr = [IntPtr]::Zero
$setupAccessPlain = $null
$setupWebhookPlain = $null
$setupJson = $null
$setupInputBytes = $null
$setupOutput = $null
$setupErrorOutput = $null
try {
    $setupNodeCommand = Get-Command node -ErrorAction SilentlyContinue
    if ($setupNodeCommand) {
        $setupNodePath = $setupNodeCommand.Source
    } else {
        $setupNodePath = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
    }
    if (-not (Test-Path -LiteralPath $setupNodePath -PathType Leaf)) {
        Write-Host 'Node.js não encontrado. Nenhuma configuração foi enviada.'
        throw 'WRAPPER_NODE_LOOKUP'
    }
    $setupStage = 'WRAPPER_SCRIPT_LOOKUP'
    $setupScriptPath = Join-Path $PSScriptRoot 'configurar-pix-cloudflare.cjs'
    if (-not (Test-Path -LiteralPath $setupScriptPath -PathType Leaf)) { throw 'WRAPPER_SCRIPT_LOOKUP' }
    Write-Host 'Configurar Pix de TESTE: 4jfinance-pix-test'
    Write-Host 'Use somente o Access Token e o segredo de webhook da aplicação de TESTE.'
    Write-Host 'Os valores ficam ocultos. Serão enviados por memória para os segredos do Cloudflare.'
    Write-Host 'O site não será publicado por este script.'
    $setupStage = 'WRAPPER_SECURE_INPUT'
    $setupAccessSecure = Read-Host 'Access Token de TESTE do Mercado Pago' -AsSecureString
    $setupWebhookSecure = Read-Host 'Segredo de webhook de TESTE do Mercado Pago' -AsSecureString
    $setupAccessPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($setupAccessSecure)
    $setupWebhookPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($setupWebhookSecure)
    $setupAccessPlain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($setupAccessPtr)
    $setupWebhookPlain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($setupWebhookPtr)
    $setupJson = @{ accessToken = $setupAccessPlain; webhookSecret = $setupWebhookPlain } | ConvertTo-Json -Compress

    $setupStage = 'WRAPPER_PROCESS_CONFIG'
    $setupUtf8 = New-Object System.Text.UTF8Encoding($false)
    $setupStart = New-Object System.Diagnostics.ProcessStartInfo
    $setupStart.FileName = $setupNodePath
    $setupStart.Arguments = '"' + $setupScriptPath + '"'
    $setupStart.WorkingDirectory = Split-Path $PSScriptRoot -Parent
    $setupStart.UseShellExecute = $false
    $setupStart.CreateNoWindow = $true
    $setupStart.RedirectStandardInput = $true
    $setupStart.RedirectStandardOutput = $true
    $setupStart.RedirectStandardError = $true
    # Windows PowerShell 5.1/.NET Framework has no StandardInputEncoding.
    # Write exact UTF-8 bytes to the input pipe, bypassing its StreamWriter/BOM.
    $setupStart.StandardOutputEncoding = $setupUtf8
    $setupStart.StandardErrorEncoding = $setupUtf8
    $setupProcess = New-Object System.Diagnostics.Process
    $setupProcess.StartInfo = $setupStart
    $setupStage = 'WRAPPER_PROCESS_START'
    if (-not $setupProcess.Start()) { throw 'WRAPPER_PROCESS_START' }
    # Drain both pipes concurrently before waiting; never replay raw child output.
    $setupOutputTask = $setupProcess.StandardOutput.ReadToEndAsync()
    $setupErrorTask = $setupProcess.StandardError.ReadToEndAsync()
    $setupStage = 'WRAPPER_INPUT_WRITE'
    $setupInputBytes = $setupUtf8.GetBytes($setupJson)
    $setupProcess.StandardInput.BaseStream.Write($setupInputBytes, 0, $setupInputBytes.Length)
    $setupProcess.StandardInput.BaseStream.Flush()
    $setupProcess.StandardInput.BaseStream.Close()
    [Array]::Clear($setupInputBytes, 0, $setupInputBytes.Length)
    $setupInputBytes = $null
    $setupAccessPlain = $null
    $setupWebhookPlain = $null
    $setupJson = $null
    $setupStage = 'WRAPPER_PROCESS_WAIT'
    $setupProcess.WaitForExit()
    $setupOutput = $setupOutputTask.GetAwaiter().GetResult()
    $setupErrorOutput = $setupErrorTask.GetAwaiter().GetResult()
    $setupStage = 'WRAPPER_RESULT_PARSE'
    if ($setupProcess.ExitCode -eq 0) {
        $setupResult = $setupOutput | ConvertFrom-Json
        if ($setupResult.ok -eq $true -and $setupResult.test -eq $true -and
            $setupResult.projectName -eq '4jfinance-pix-test' -and
            $setupResult.merchantValidated -eq $true -and $setupResult.webhookSecretConfigured -eq $true) {
            Write-Host 'Concluído: conta de teste validada e segredos configurados no projeto de TESTE.'
            Write-Host 'Relatório sem segredos: work/pix-cloudflare/secrets-setup.json'
            Write-Host 'A publicação do site continua sendo uma etapa separada.'
            $setupExitCode = 0
        }
    }
    if ($setupExitCode -ne 0) {
        $setupSafeCodes = @('INVALID_INPUT', 'INVALID_TEST_CONFIG', 'MERCHANT_NOT_TEST',
            'MERCHANT_MISMATCH', 'MP_REQUEST_FAILED', 'CF_REQUEST_FAILED', 'CF_ACCOUNT_MISMATCH',
            'CF_PROJECT_MISMATCH', 'CF_CONFIG_INVALID', 'CF_VERIFICATION_FAILED',
            'WRANGLER_LOGIN_REQUIRED', 'NO_ARGUMENTS_ALLOWED', 'PRIVATE_OUTPUT_NOT_IGNORED',
            'CONFIG_READ_FAILED', 'REPORT_WRITE_FAILED', 'SETUP_FAILED')
        $setupCode = 'SETUP_FAILED'
        try {
            $setupFailure = $setupErrorOutput | ConvertFrom-Json
            if ($setupSafeCodes -contains $setupFailure.errorCode) { $setupCode = $setupFailure.errorCode }
        } catch { }
        Write-Host ('Não foi possível confirmar a configuração de teste. Código: ' + $setupCode)
        Write-Host 'Nenhum detalhe de credencial será exibido. O site não foi publicado.'
    }
} catch {
    $setupCode = 'WRAPPER_FAILED'
    if ($setupSafeStages -contains $setupStage) { $setupCode = $setupStage }
    Write-Host ('Falha ao executar a configuração de teste. Código: ' + $setupCode)
    Write-Host 'Nenhum detalhe de credencial será exibido. O site não foi publicado.'
} finally {
    # Cleanup must not expose an exception or skip the final window pause.
    if ($setupAccessPtr -ne [IntPtr]::Zero) { try { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($setupAccessPtr) } catch { } }
    if ($setupWebhookPtr -ne [IntPtr]::Zero) { try { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($setupWebhookPtr) } catch { } }
    if ($setupAccessSecure) { try { $setupAccessSecure.Dispose() } catch { } }
    if ($setupWebhookSecure) { try { $setupWebhookSecure.Dispose() } catch { } }
    if ($setupInputBytes) { [Array]::Clear($setupInputBytes, 0, $setupInputBytes.Length) }
    if ($setupProcess) { try { $setupProcess.Dispose() } catch { } }
    $setupAccessPlain = $null
    $setupWebhookPlain = $null
    $setupJson = $null
    $setupInputBytes = $null
    $setupOutput = $null
    $setupErrorOutput = $null
    $setupOutputTask = $null
    $setupErrorTask = $null
    $setupResult = $null
    $setupFailure = $null
}
[void](Read-Host 'Pressione Enter para fechar esta janela')
exit $setupExitCode