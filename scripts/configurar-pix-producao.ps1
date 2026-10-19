# Configuração exclusiva do projeto Cloudflare Pages 4jfinance.
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
    $setupScriptPath = Join-Path $PSScriptRoot 'configurar-pix-producao.cjs'
    if (-not (Test-Path -LiteralPath $setupScriptPath -PathType Leaf)) { throw 'WRAPPER_SCRIPT_LOOKUP' }
    Write-Host 'Configurar Pix de PRODUÇÃO: 4jfinance'
    Write-Host 'Use somente o Access Token e o segredo de webhook da aplicação de PRODUÇÃO.'
    Write-Host 'Os valores ficam ocultos. Serão enviados por memória para os segredos do Cloudflare.'
    Write-Host 'O site não será publicado. PAYMENTS_ENABLED continuará false.'
    $setupStage = 'WRAPPER_SECURE_INPUT'
    $setupAccessSecure = Read-Host 'Access Token de PRODUÇÃO do Mercado Pago' -AsSecureString
    $setupWebhookSecure = Read-Host 'Segredo de webhook de PRODUÇÃO do Mercado Pago' -AsSecureString
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
        if ($setupResult.ok -eq $true -and $setupResult.test -eq $false -and $setupResult.production -eq $true -and $setupResult.paymentsEnabled -eq $false -and
            $setupResult.projectName -eq '4jfinance' -and
            $setupResult.merchantValidated -eq $true -and $setupResult.webhookSecretConfigured -eq $true -and $setupResult.localCollectorUpdated -eq $true) {
            Write-Host 'Concluído: conta de produção validada e segredos configurados no projeto de PRODUÇÃO.'
            Write-Host 'Relatório sem segredos: work/pix-cloudflare/production-secrets-setup.json'
            Write-Host 'Pagamentos continuam desativados. Publicar e ativar são etapas separadas.'
            $setupExitCode = 0
        }
    }
    if ($setupExitCode -ne 0) {
        $setupSafeCodes = @('INVALID_INPUT', 'INVALID_PRODUCTION_CONFIG', 'MERCHANT_NOT_PRODUCTION',
            'MERCHANT_MISMATCH', 'MP_REQUEST_FAILED', 'CF_REQUEST_FAILED', 'CF_ACCOUNT_MISMATCH',
            'CF_PROJECT_MISMATCH', 'CF_DB_MISMATCH', 'CF_CONFIG_INVALID', 'CF_VERIFICATION_FAILED',
            'WRANGLER_LOGIN_REQUIRED', 'NO_ARGUMENTS_ALLOWED', 'PRIVATE_OUTPUT_NOT_IGNORED',
            'CONFIG_READ_FAILED', 'CONFIG_CHANGED', 'CONFIG_UPDATE_FAILED', 'REPORT_WRITE_FAILED', 'SETUP_FAILED')
        $setupCode = 'SETUP_FAILED'
        try {
            $setupFailure = $setupErrorOutput | ConvertFrom-Json
            if ($setupSafeCodes -contains $setupFailure.code) { $setupCode = $setupFailure.code }
        } catch { }
        Write-Host ('Não foi possível confirmar a configuração de produção. Código: ' + $setupCode)
        Write-Host 'Nenhum detalhe de credencial será exibido. O site não foi publicado.'
        Write-Host 'Consulte o relatório seguro em work/pix-cloudflare/production-secrets-setup.json.'
        if ($setupFailure.cloudflareWriteAttempted -eq $true -and $setupFailure.cloudflareWriteConfirmed -ne $true) {
            Write-Host 'A confirmação remota ficou incompleta. A configuração local não foi atualizada.'
        }
    }
} catch {
    $setupCode = 'WRAPPER_FAILED'
    if ($setupSafeStages -contains $setupStage) { $setupCode = $setupStage }
    Write-Host ('Falha ao executar a configuração de produção. Código: ' + $setupCode)
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