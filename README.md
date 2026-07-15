# Dependências compartilhadas

Este diretório centraliza as dependências PHP utilizadas por `manager` e `manager_main`.

## Instalação

Execute a instalação uma única vez a partir deste diretório:

```sh
composer install --no-dev --optimize-autoloader
```

Os dois sistemas carregam o arquivo `vendor/autoload.php` gerado aqui. Por padrão, eles esperam que este diretório esteja no mesmo nível de `manager` e `manager_main`. Para usar outro caminho, defina a variável de ambiente `SHARED_ASSETS_PATH` com o caminho absoluto deste diretório.

## Atualização

Atualizações devem ser feitas neste diretório e testadas nos dois sistemas antes da publicação:

```sh
composer update
```

O arquivo `composer.lock` é a única fonte das versões utilizadas pelos dois sistemas e deve permanecer versionado. O diretório `vendor` é gerado pelo Composer e não deve ser versionado.
