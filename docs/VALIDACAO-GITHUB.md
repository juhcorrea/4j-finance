# Validacao da sincronizacao GitHub — 15/10/2026

- 135 testes node:test de cookies, anuncios e pagamento simulado: aprovados.
- 16 verificacoes de privacidade/cadastro em VM: aprovadas.
- 15 cenarios de paginas publicas, preferencias, revogacao, expiracao e navegacao: aprovados.
- 10 cenarios de login/cadastro entre 320 e 1440 pixels: aprovados, sem gravacoes Firebase.
- Reproducao isolada do build: public/index.html identico ao arquivo publicado (SHA-256 65ba6a9da9e58156a6d04bc94c8f45188e71ab4c12752135e60faedaf0d8a703).
- Nenhum novo teste de banco real, pagamento real, envio AdSense ou deploy foi executado para essa sincronizacao.
- A revisao da exportacao excluiu credenciais, auditorias privadas, caches Wrangler e dependencias instaladas. O Git preserva os bytes dos arquivos para que o build e os hashes do manifesto correspondam tambem em outro sistema operacional.

Os testes de navegador usaram Chromium/Edge em ambiente de teste e dados simulados; nao equivalem a verificacao em um iPhone fisico. A CMP Google real e o checkout Pix permanecem pendentes das etapas documentadas.
