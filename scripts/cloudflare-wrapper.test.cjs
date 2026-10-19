'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const WINDOWS = process.platform === 'win32';
const POWERSHELL = WINDOWS ? path.join(process.env.SystemRoot || 'C:/Windows',
  'System32/WindowsPowerShell/v1.0/powershell.exe') : '';
const INPUT = { accessToken: 'synthetic_access_token_123_á_漢_"_\\',
  webhookSecret: 'synthetic_webhook_secret_456_ç_"_\\' };
const psLiteral = value => "'" + String(value).replaceAll("'", "''") + "'";
const WRAPPER = path.join(__dirname, 'configurar-pix-cloudflare.ps1');

// Runs only a copy in an isolated directory. The real JS helper, config and OAuth
// files are never copied or loaded; the child has no network implementation.
function runWrapper(mode = 'success') {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), '4j-wrapper-synthetic-'));
  try {
    const scripts = path.join(temporary, 'scripts');
    fs.mkdirSync(scripts);
    fs.copyFileSync(WRAPPER, path.join(scripts, 'configurar-pix-cloudflare.ps1'));
    const fakeHelper = `
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const expected = ${JSON.stringify(INPUT)};
const mode = ${JSON.stringify(mode)};
const chunks = [];
process.stdin.on('data', chunk => chunks.push(chunk));
process.stdin.on('end', () => {
  const bytes = Buffer.concat(chunks);
  assert.equal(bytes.subarray(0, 3).equals(Buffer.from([239, 187, 191])), false, 'No UTF-8 BOM');
  const received = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  assert.deepEqual(received, expected);
  assert.equal(process.argv.length, 2, 'No credential arguments');
  for (const secret of Object.values(expected)) {
    assert.equal(process.argv.join(' ').includes(secret), false);
    assert.equal(JSON.stringify(process.env).includes(secret), false);
  }
  fs.writeFileSync(path.join(__dirname, 'stdin-verified.json'), JSON.stringify({ utf8: true, bom: false, argumentsSafe: true }));
  const report = { ok: true, test: true, projectName: '4jfinance-pix-test', merchantValidated: true, webhookSecretConfigured: true };
  if (mode === 'known') {
    process.stderr.write(JSON.stringify({ errorCode: 'CF_REQUEST_FAILED', message: Object.values(expected).join('') }));
    process.exitCode = 1;
  } else if (mode === 'unknown') {
    process.stderr.write(JSON.stringify({ errorCode: expected.accessToken, message: expected.webhookSecret }));
    process.exitCode = 1;
  } else if (mode === 'malformed') {
    process.stdout.write(Object.values(expected).join(''));
  } else {
    if (mode === 'wrong-project') report.projectName = '4jfinance';
    process.stdout.write(JSON.stringify(report));
  }
});
`;
    fs.writeFileSync(path.join(scripts, 'configurar-pix-cloudflare.cjs'), fakeHelper);
    let executable = process.execPath;
    if (mode === 'missing-node') executable = path.join(temporary, 'absent-node.exe');
    if (mode === 'start-error') {
      executable = path.join(temporary, 'invalid-node.exe');
      fs.writeFileSync(executable, 'synthetic invalid executable');
    }
    const harness = `
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$script:syntheticInputCount = 0
function Get-Command { param($Name, $ErrorAction) [pscustomobject]@{ Source = ${psLiteral(executable)} } }
function Read-Host {
  param([string]$Prompt, [switch]$AsSecureString)
  if ($AsSecureString) {
    $script:syntheticInputCount++
    if ($script:syntheticInputCount -eq 1) { $value = ${psLiteral(INPUT.accessToken)} }
    else { $value = ${psLiteral(INPUT.webhookSecret)} }
    $secure = New-Object System.Security.SecureString
    foreach ($character in $value.ToCharArray()) { $secure.AppendChar($character) }
    $secure.MakeReadOnly()
    return $secure
  }
  Write-Host 'SYNTHETIC_FINAL_PAUSE_REACHED'
  return ''
}
& ${psLiteral(path.join(scripts, 'configurar-pix-cloudflare.ps1'))}
exit $LASTEXITCODE
`;
    const harnessPath = path.join(temporary, 'harness.ps1');
    fs.writeFileSync(harnessPath, '\uFEFF' + harness, 'utf8');
    const result = spawnSync(POWERSHELL,
      ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', harnessPath],
      { encoding: 'utf8', cwd: temporary, timeout: 15000, windowsHide: true, maxBuffer: 1024 * 1024 });
    assert.equal(result.error, undefined);
    const output = result.stdout + result.stderr;
    for (const secret of Object.values(INPUT)) assert.equal(output.includes(secret), false, 'No synthetic credential in output');
    const marker = path.join(scripts, 'stdin-verified.json');
    return { status: result.status, output, inputVerified: fs.existsSync(marker) };
  } finally {
    assert.equal(path.dirname(path.resolve(temporary)), path.resolve(os.tmpdir()));
    assert.match(path.basename(temporary), /^4j-wrapper-synthetic-/);
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

test('Windows PowerShell 5.1 sends exact UTF-8 JSON without BOM and preserves final pause', { skip: !WINDOWS }, () => {
  const result = runWrapper();
  assert.equal(result.status, 0, result.output);
  assert.equal(result.inputVerified, true);
  assert.match(result.output, /Concluído:/);
  assert.match(result.output, /SYNTHETIC_FINAL_PAUSE_REACHED/);
});

test('wrapper displays only allowlisted child errors and no raw stdout or stderr', { skip: !WINDOWS }, () => {
  for (const [mode, code] of [['known', 'CF_REQUEST_FAILED'], ['unknown', 'SETUP_FAILED'], ['wrong-project', 'SETUP_FAILED']]) {
    const result = runWrapper(mode);
    assert.equal(result.status, 1, result.output);
    assert.equal(result.inputVerified, true);
    assert.match(result.output, new RegExp('Código: ' + code));
    assert.doesNotMatch(result.output, /Concluído:/);
    assert.match(result.output, /SYNTHETIC_FINAL_PAUSE_REACHED/);
  }
});

test('wrapper identifies parse and launch stages without exceptions and still pauses', { skip: !WINDOWS }, () => {
  for (const [mode, code, inputVerified] of [
    ['malformed', 'WRAPPER_RESULT_PARSE', true],
    ['missing-node', 'WRAPPER_NODE_LOOKUP', false],
    ['start-error', 'WRAPPER_PROCESS_START', false]
  ]) {
    const result = runWrapper(mode);
    assert.equal(result.status, 1, result.output);
    assert.equal(result.inputVerified, inputVerified);
    assert.match(result.output, new RegExp('Código: ' + code));
    assert.doesNotMatch(result.output, /CategoryInfo|FullyQualifiedErrorId|System\.ComponentModel|Exception/);
    assert.match(result.output, /SYNTHETIC_FINAL_PAUSE_REACHED/);
  }
});