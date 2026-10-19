# Atualiza somente MP_WEBHOOK_SECRET no projeto de TESTE 4jfinance-pix-test.
# Não publica o site, não cria cobranças e não aceita segredos como argumentos.
$ErrorActionPreference = 'Stop'
$setupExitCode = 1
$setupStage = 'WRAPPER_NODE_LOOKUP'
$setupSafeStages = @('WRAPPER_NODE_LOOKUP', 'WRAPPER_SCRIPT_LOOKUP',
    'WRAPPER_SECURE_INPUT', 'WRAPPER_PROCESS_CONFIG', 'WRAPPER_PROCESS_START',
    'WRAPPER_INPUT_WRITE', 'WRAPPER_PROCESS_WAIT', 'WRAPPER_RESULT_PARSE')
$setupProcess = $null
$setupWebhookSecure = $null
$setupWebhookPtr = [IntPtr]::Zero
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
    $setupScriptPath = Join-Path $PSScriptRoot 'configurar-webhook-pix-teste.cjs'
    if (-not (Test-Path -LiteralPath $setupScriptPath -PathType Leaf)) { throw 'WRAPPER_SCRIPT_LOOKUP' }
    Write-Host 'Atualizar segredo de webhook: TESTE 4jfinance-pix-test'
    Write-Host 'Copie Assinatura secreta em Webhooks, não Access Token.'
    Write-Host 'Escolha a mesma aplicação e ambiente usados no simulador.'
    Write-Host 'Os valores ficam ocultos. Serão enviados por memória para os segredos do Cloudflare.'
    Write-Host 'Somente a chave do webhook será atualizada. Access Token e produção não serão alterados.'
    $setupStage = 'WRAPPER_SECURE_INPUT'
    $setupWebhookSecure = Read-Host 'Segredo do webhook usado na simulação de TESTE' -AsSecureString
    $setupWebhookPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($setupWebhookSecure)
    $setupWebhookPlain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($setupWebhookPtr)

    $setupJson = @{ webhookSecret = $setupWebhookPlain } | ConvertTo-Json -Compress

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
    $setupWebhookPlain = $null
    $setupJson = $null
    $setupStage = 'WRAPPER_PROCESS_WAIT'
    $setupProcess.WaitForExit()
    $setupOutput = $setupOutputTask.GetAwaiter().GetResult()
    $setupErrorOutput = $setupErrorTask.GetAwaiter().GetResult()
    $setupStage = 'WRAPPER_RESULT_PARSE'
    if ($setupProcess.ExitCode -eq 0) {
        $setupResult = $setupOutput | ConvertFrom-Json
        if ($setupResult.ok -eq $true -and $setupResult.test -eq $true -and $setupResult.accessTokenChanged -eq $false -and $setupResult.deploymentRequired -eq $true -and
            $setupResult.projectName -eq '4jfinance-pix-test' -and
            $setupResult.webhookSecretConfigured -eq $true) {
            Write-Host 'Concluído: somente o segredo do webhook de TESTE foi atualizado.'
            Write-Host 'Relatório sem segredos: work/pix-cloudflare/webhook-secret-setup.json'
            Write-Host 'É necessário republicar somente o teste antes de reenviar a simulação.'
            $setupExitCode = 0
        }
    }
    if ($setupExitCode -ne 0) {
        $setupSafeCodes = @('INVALID_INPUT', 'INVALID_TEST_CONFIG', 'WRANGLER_LOGIN_REQUIRED',
            'CF_REQUEST_FAILED', 'CF_ACCOUNT_MISMATCH', 'CF_PROJECT_MISMATCH', 'CF_CONFIG_INVALID',
            'CF_VERIFICATION_FAILED', 'NO_ARGUMENTS_ALLOWED', 'PRIVATE_OUTPUT_NOT_IGNORED',
            'CONFIG_READ_FAILED', 'REPORT_WRITE_FAILED', 'SETUP_FAILED')
        $setupCode = 'SETUP_FAILED'
        try {
            $setupFailure = $setupErrorOutput | ConvertFrom-Json
            if ($setupSafeCodes -contains $setupFailure.errorCode) { $setupCode = $setupFailure.errorCode }
        } catch { }
        Write-Host ('Não foi possível confirmar a configuração do webhook de teste. Código: ' + $setupCode)
        Write-Host 'Nenhum detalhe de credencial será exibido. O site não foi publicado.'
        if ($setupFailure.cloudflareWriteAttempted -eq $true -and $setupFailure.cloudflareWriteConfirmed -ne $true) {
            Write-Host 'A confirmação remota ficou incompleta; não reenvie a simulação ainda.'
        }
    }
} catch {
    $setupCode = 'WRAPPER_FAILED'
    if ($setupSafeStages -contains $setupStage) { $setupCode = $setupStage }
    Write-Host ('Falha ao executar a configuração do webhook de teste. Código: ' + $setupCode)
    Write-Host 'Nenhum detalhe de credencial será exibido. O site não foi publicado.'
} finally {
    # Cleanup must not expose an exception or skip the final window pause.
    if ($setupWebhookPtr -ne [IntPtr]::Zero) { try { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($setupWebhookPtr) } catch { } }
    if ($setupWebhookSecure) { try { $setupWebhookSecure.Dispose() } catch { } }
    if ($setupInputBytes) { [Array]::Clear($setupInputBytes, 0, $setupInputBytes.Length) }
    if ($setupProcess) { try { $setupProcess.Dispose() } catch { } }
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