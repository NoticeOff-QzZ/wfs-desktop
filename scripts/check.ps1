$ErrorActionPreference = 'Stop'

$cargoBin = Join-Path $env:USERPROFILE '.cargo\bin'
if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
  if (-not (Test-Path (Join-Path $cargoBin 'cargo.exe'))) {
    throw 'cargo not found; install Rust or add %USERPROFILE%\.cargo\bin to PATH'
  }
  $env:PATH = "$cargoBin;$env:PATH"
}

npm run typecheck
npm test
npm run lint
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml --lib
