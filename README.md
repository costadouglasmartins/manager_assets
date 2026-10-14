# Dependências compartilhadas

## Deployment

For automatic publication to the existing VPS, see [deployment instructions](docs/deployment.md).

Este diretório centraliza as dependências compartilhadas por `manager` e `manager_main`.

- `vendor/` contém as bibliotecas PHP privadas, carregadas somente pelo servidor.
- `bootstrap/` contém os arquivos estáticos públicos do Bootstrap e Bootstrap Icons.
- `fullcalendar/` contém os arquivos JavaScript públicos do FullCalendar.
- `autocomplete/`, `helpers/`, `masks/`, `richtexteditor/` e `viacep/` contêm bibliotecas JavaScript públicas compartilhadas.

O servidor web deve liberar somente os arquivos estáticos necessários dentro de `/assets/bootstrap/` e os arquivos JavaScript de `/assets/fullcalendar/`, `/assets/autocomplete/`, `/assets/helpers/`, `/assets/masks/`, `/assets/richtexteditor/` e `/assets/viacep/`. Todos os demais caminhos de `/assets`, incluindo `vendor`, `composer.json` e `composer.lock`, devem permanecer bloqueados.

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
