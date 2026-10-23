# Catatau no modo firme

Decisao de 23/10/2026: ao ativar o modo firme, Catatau veste chapeu de cowboy, botinhas com espora e coldre, como um mini xerife que acompanha os planos. A versao conserva a identidade, a bandana verde e a expressao amigavel do mascote. Ao desativar, retorna ao visual original. A preferencia continua restrita ao login e perfil atuais.

Arquivo usado no site: `public/assets/catatau-sheriff.webp`, 600 x 625 pixels, 81.016 bytes, com transparencia real. Criado com a ferramenta integrada de geracao de imagens, a partir de `public/assets/catatau.webp`; sem CLI/API de geracao. A conversao WebP apenas reduziu o tamanho para uso no site, preservando o alpha. Nenhum servico de IA e chamado pelo site para trocar o visual.

Acessorios: chapeu marrom com estrela dourada, cinto com coldre vazio e botas com esporas decorativas. O modo firme continua sendo orientacao voluntaria: nao interfere em banco, cartao ou registro de despesas.

## Prompt final utilizado

```text
Use case: identity-preserve.
Asset type: transparent mascot variant for the existing 4J Finance website, displayed when the user enables Catatau's optional firm budgeting mode.
Input image 1 is the edit target: the original Catatau mascot, a friendly plush 3D brown beaver with a green bandana, small gold pin, round soft belly, dark rounded nose, two front teeth, welcoming smile, raised waving paw and broad textured beaver tail.
Primary request: dress this exact same Catatau as a cute miniature sheriff. Add a warm brown cowboy hat with curved brim, a small tasteful gold sheriff star, a brown leather belt with a small EMPTY leather holster on his hip, and two tiny cowboy boots with small rounded decorative metal spurs visible near the heels.
Preserve his face, identity, green bandana, warm fur, existing body proportions, gentle cheerful expression, raised paw and tail. Outfit is accessories only, no human body or big coat. No gun or other weapon. He should look caring and watchful, not aggressive.
Full body including entire hat, both boots, spurs, tail and raised paw visible; centered, compact portrait composition with a small margin around silhouette, no cropping. Same polished soft 3D plush rendering and lighting as the original, consistent natural leather and subdued gold.
Genuinely transparent background with clean alpha edges; no scene, floor, text, watermark, labels or checkered background baked into image. One character only.
```


## Validacao e publicacao

Publicado em 23/10/2026 no deployment 2e16fdf1. QA em Chromium: 320x568, 320x844, 390x844 e 1440x1000, com alternancia, persistencia, perfis e imagens carregadas. 496 testes e 16 checks mock/VM de privacidade aprovados. Hashes do HTML e do WebP conferidos no dominio oficial, alias e versao canonica; Pix e configuracoes preservados.
