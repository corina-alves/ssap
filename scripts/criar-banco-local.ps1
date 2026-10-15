# Cria o usuário e o banco da Sala de Situação no PostgreSQL local (Windows),
# grava DATABASE_URL no .env.local e aplica as migrações.
#
#   powershell -ExecutionPolicy Bypass -File scripts\criar-banco-local.ps1
#
# Pede a senha do usuário postgres (não fica gravada). A aplicação passa a usar
# o usuário ssap_app, sem superusuário, com uma senha forte gerada aqui.

param(
    [string]$Servidor = 'localhost',
    [int]$Porta = 5432,
    [string]$Banco = 'ssap',
    [string]$Usuario = 'ssap_app'
)

$ErrorActionPreference = 'Stop'
$raiz = Split-Path -Parent $PSScriptRoot

$psql = (Get-Command psql -ErrorAction SilentlyContinue).Source
if (-not $psql) {
    $psql = Get-ChildItem 'C:\Program Files\PostgreSQL\*\bin\psql.exe' -ErrorAction SilentlyContinue |
        Sort-Object { [int]($_.Directory.Parent.Name) } -Descending |
        Select-Object -First 1 -ExpandProperty FullName
}
if (-not $psql) { throw 'psql.exe não encontrado. Instale o PostgreSQL ou ponha a pasta bin no PATH.' }

$segura = Read-Host 'Senha do usuário postgres' -AsSecureString
$ponteiro = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($segura)
$env:PGPASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ponteiro)
[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ponteiro)
$env:PGCLIENTENCODING = 'UTF8'

function Invoke-Psql([string]$BancoAlvo, [string]$Sql, [string[]]$Variaveis = @()) {
    $argumentos = @('-h', $Servidor, '-p', $Porta, '-U', 'postgres', '-d', $BancoAlvo, '-v', 'ON_ERROR_STOP=1', '-X', '-q', '-t', '-A')
    foreach ($v in $Variaveis) { $argumentos += @('-v', $v) }
    $saida = $Sql | & $psql @argumentos
    if ($LASTEXITCODE -ne 0) { throw "psql falhou (código $LASTEXITCODE)." }
    return $saida
}

try {
    $existe = Invoke-Psql 'postgres' 'SELECT 1 FROM pg_database WHERE datname = :''banco'';' @("banco=$Banco")
    if ($existe) {
        Write-Host "O banco '$Banco' já existe. Tabelas:"
        Invoke-Psql $Banco "SELECT '  ' || tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY 1;" | Write-Host
        $resposta = Read-Host "Digite APAGAR para apagar o banco '$Banco' e recriar (qualquer outra coisa mantém)"
        if ($resposta -cne 'APAGAR') {
            Write-Host 'Banco mantido. Para aplicar só as migrações que faltam: npm run db:migrar'
            return
        }
        Invoke-Psql 'postgres' 'DROP DATABASE :"banco" WITH (FORCE);' @("banco=$Banco") | Out-Null
    }

    # Senha forte, só com letras e números (não precisa de escape na URL).
    $bytes = New-Object byte[] 48
    [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    $senhaApp = ([Convert]::ToBase64String($bytes) -replace '[^A-Za-z0-9]', '').Substring(0, 40)

    $variaveis = @("usuario=$Usuario", "senha=$senhaApp", "banco=$Banco")
    $temUsuario = Invoke-Psql 'postgres' 'SELECT 1 FROM pg_roles WHERE rolname = :''usuario'';' $variaveis
    if ($temUsuario) {
        Invoke-Psql 'postgres' 'ALTER ROLE :"usuario" LOGIN PASSWORD :''senha'' NOSUPERUSER NOCREATEDB NOCREATEROLE;' $variaveis | Out-Null
    } else {
        Invoke-Psql 'postgres' 'CREATE ROLE :"usuario" LOGIN PASSWORD :''senha'' NOSUPERUSER NOCREATEDB NOCREATEROLE;' $variaveis | Out-Null
    }
    Invoke-Psql 'postgres' 'CREATE DATABASE :"banco" OWNER :"usuario" ENCODING ''UTF8'' TEMPLATE template0;' $variaveis | Out-Null
    Invoke-Psql 'postgres' 'REVOKE ALL ON DATABASE :"banco" FROM PUBLIC; GRANT CONNECT ON DATABASE :"banco" TO :"usuario";' $variaveis | Out-Null

    # Grava DATABASE_URL no .env.local, preservando as outras linhas.
    $envLocal = Join-Path $raiz '.env.local'
    $url = "DATABASE_URL=postgres://${Usuario}:${senhaApp}@${Servidor}:${Porta}/${Banco}"
    $linhas = @()
    if (Test-Path $envLocal) { $linhas = @(Get-Content $envLocal -Encoding UTF8 | Where-Object { $_ -notmatch '^\s*DATABASE_URL\s*=' }) }
    [IO.File]::WriteAllLines($envLocal, @($url) + $linhas, (New-Object Text.UTF8Encoding $false))
    Write-Host "Banco '$Banco' criado; DATABASE_URL gravada em .env.local."
}
finally {
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
}

Push-Location $raiz
try {
    npm run db:migrar
    if ($LASTEXITCODE -ne 0) { throw 'As migrações falharam.' }
}
finally { Pop-Location }

Write-Host ''
Write-Host 'Pronto. Agora: npm run admin:criar  e depois  npm run dev'
