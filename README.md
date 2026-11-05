# R Commander Play

Extensión de VS Code para trabajar con R al estilo de **R Commander**.

- Botón verde ▶ que ejecuta la selección o el archivo con la salida visible
- Menús de R Commander con sus diálogos (371 comandos: Rcmdr y RcmdrPlugin.TeachStat)
- Español por defecto, inglés opcional

## Requisitos

- VS Code ≥ 1.85
- R
- Extensión [REditorSupport.r](https://marketplace.visualstudio.com/items?itemName=REditorSupport.r)
- Paquete `Rcmdr` con sus dependencias (`car`, `RcmdrMisc`...)
- Complemento `RcmdrPlugin.TeachStat` (menú Estadística Básica) y `distr`
- Según el comando: `rgl`, `mgcv`, `leaps`, `sem`, `aplpack`, `lme4`, `nnet`...
  (*Herramientas ▸ Instalar paquete(s)...* los instala desde `cloud.r-project.org`)
- Opcional: [arf](https://github.com/eitsupi/arf) para el panel Interactive
- Para `rgl` y la identificación con el ratón: una sesión gráfica (X11 o XWayland)

## Instalación

```sh
make install       # genera, empaqueta dist/r-commander-play-<versión>.vsix e instala en VS Code
make package       # solo crea el .vsix
```

Después: **Developer: Reload Window**.

## Qué incluye

- Menú **R Commander** en el menú **⋯** de los archivos R y en la barra lateral de R (árbol con colores y búsqueda)
- Formulario en una ventana (o en pasos) con listas de variables, opciones, tablas y *Aceptar / Aplicar / Cancelar / Reiniciar*
- El código generado se pega en el script y se ejecuta con eco
- Salida en el terminal de R o en el panel Interactive de arf
- Colores de sintaxis en el terminal
- Hover sobre funciones de R con su ruta en los menús
- Funciones de Rcmdr disponibles sin abrir la ventana Tk
- Instalador de paquetes (mirror, lista filtrable, actualizar, archivos locales, descargas permanentes)
- Documentos R Markdown y knitr que recogen los comandos
- *Guardar salida* a un archivo de texto
- Gráficos 3D de `rgl` (dispersión, componente+residuo, variable añadida) en su ventana
- Identificación de puntos con el ratón en una ventana X11 de R
- Arreglo del visor del Workspace para listas con clase

## Uso

1. Abre un archivo R y carga datos (*Datos ▸ Cargar conjunto de datos...*)
2. Elige un comando en **⋯ ▸ R Commander** o en la barra lateral
3. Rellena el formulario y pulsa **Aceptar**

### Botones

- Barra del editor: interrumpir R, instalar paquetes, limpiar terminal, play verde
- Vista *Interactive Sessions*: ejecutar en el terminal / en arf
- Panel de arf, barra: vista previa corta de resultados largos
- Panel de arf, menú ⋯: todos los ajustes de R Play (formulario), notación fija, tamaño de la vista previa, salidas con
  desplazamiento, colapsar / expandir salidas, ajustar líneas largas, panel debajo del script, ejecutar en terminal
- Menú ⋯ de *Interactive Sessions*: las mismas opciones
- Menú ⋯ de la barra lateral: cerrar menús al elegir, pegar el código en el script

### Menú Editar y Fichero

- *Editar documento R Markdown / knitr*: crea `<script>.Rmd` o `.Rnw` y añade título y bloque de cada comando
- *Quitar último bloque / título*: deshace en ese documento
- *Guardar salida* y *Guardar salida como*: texto impreso por los comandos, sin colores

### Gráficos con ventana propia

- `rgl`: *Gráfico 3D*, *Componente+residuo 3D*, *Variable añadida 3D*, *Identificar observaciones con el ratón*
- Ratón en 2D (diagrama de dispersión, boxplot, índices, QQ, influencia, variable añadida): abre una ventana X11

## Ajustes

| Ajuste | Por defecto | Qué hace |
| --- | --- | --- |
| `rCommanderPlay.cranMirror` | `https://cloud.r-project.org` | Mirror de CRAN del instalador de paquetes (*Herramientas ▸ Elegir mirror de CRAN...* lo cambia). |
| `rCommanderPlay.packageDownloads` | `~/.cache/r-commander-play/packages` | Carpeta permanente de descargas del instalador; es también un repositorio local que se consulta antes que CRAN. |
| `rCommanderPlay.language` | `es` | Idioma de los diálogos y del árbol (`es`, `en`, `auto`). Las etiquetas de los menús se fijan al arrancar VS Code: usa **R Commander: Cambiar idioma (English / Español)** y recarga la ventana. |
| `rCommanderPlay.dialogStyle` | `form` | `form`: una ventana con todo. `steps`: una pregunta cada vez en la barra superior. |
| `rCommanderPlay.menuAction` | `both` | `run`, `insert` o `both` (insertar en el script y ejecutar, como Rcmdr). |
| `rCommanderPlay.runTarget` | `auto` | Dónde se ejecuta el código: `terminal`, `arf` (panel Interactive de arf) o `auto` (lo que use la extensión de R). |
| `rCommanderPlay.loadRcmdrFunctions` | `true` | Carga las funciones de Rcmdr y sus complementos antes de cada ejecución. |
| `rCommanderPlay.rcmdrPlugins` | `[]` | Complementos a cargar; vacío = todos los `RcmdrPlugin.*` instalados. |
| `rCommanderPlay.skipHelp`, `skipCommands` | `true`, `[]` | Qué omite el botón verde (ver más abajo). |
| `rCommanderPlay.limitOutput`, `maxOutputItems` | `true`, `24` | Vista previa de resultados largos. |
| `rCommanderPlay.fixedNotation` | `false` | Imprime `0.00002789` en vez de `2.789e-05` (opción `scipen` de R, solo durante cada ejecución). |
| `rCommanderPlay.syntaxColors` | `true` | Colores de sintaxis en el código R que aparece en el terminal. |
| `rCommanderPlay.closeMenusAfterChoice` | `false` | Pliega los menús del árbol al elegir una opción, como los menús desplegables de R Commander. |

`runTarget` `terminal`/`arf` escribe `r.interactive.executionTarget` de la extensión de R; las opciones del panel de
arf escriben `notebook.output.wordWrap` y `workbench.editor.openSideBySideDirection`.

## Botón verde

- Ejecuta la selección o, sin selección, guarda y ejecuta el archivo
- Omitir ayuda (`?x`, `help(...)`) y comandos a omitir (`fix, View, utils::example`); los menús ignoran esto
- Limitar salidas largas con `max.print`
- Colorear sintaxis (interruptor en *Configurar el botón verde*, paleta de comandos y menú del editor)
- La barra de estado muestra estas opciones y abre *Configurar el botón verde*

## Estructura

```
extension.js     activación: botón verde, comandos, árbol, hover, barra de estado
runner.R         run_code, consultas a la sesión, registro de salida, funciones de Rcmdr
lib/             commander, form, formmodel, dialog, rsession, report, tree, hover, i18n, rhelpers
catalog/         un objeto por comando de Rcmdr: campos y código R
build/           generate.js, Rcmdr-menus.txt y Rcmdr-es.po (de Rcmdr), package.base.json
data/ i18n/      generado (solo se edita i18n/es.manual.json)
tests/           pruebas
```

`package.json`, `package.nls*.json` y `data/` se generan: tras tocar el catálogo, `make generate`.

## Añadir o cambiar un comando

Una entrada de `catalog/*.js` con el nombre de su función en Rcmdr (el de `build/Rcmdr-menus.txt`):

```js
singleSampleTTest: {
  pkgs: ['car'],
  fields: [
    numVar('x', 'Variable (pick one)'),
    alt('Population mean < mu0', 'Population mean > mu0'),
    { k: 'mu', type: 'num', label: 'Null hypothesis: mu =', def: '0.0' },
    conf
  ],
  code: (v, c) => `t.test(${c.dv(v.x)}, alternative = ${rs(v.alt)}, mu = ${v.mu}, conf.level = ${v.conf})`
}
```

- Mismos campos, etiquetas, valores por defecto y código R que el diálogo de Rcmdr (`deparse(Rcmdr:::<id>)`)
- Campos: `var` (`kind`: `numeric`, `factor`, `twolevel`, `discrete`, `character`, `any`...), `dataset`, `model`, `models`,
  `hclust`, `choice`, `flags`, `num`, `numlist`, `text`, `name`, `file`, `dir`, `installed`, `rlist`, `levelorder`,
  `renames`, `matrix`, `formula`, `table`, `note`, `hidden`
- Claves: `when`, `exclude`, `optional`, `def`, `min`, `max`, `pattern`, `compact`, `label: ''` + `prompt`
- Del comando: `ds: false`, `needsModel`, `pkgs`, `activeDataset`, `activeModel`, `after`, `check`, `noForm`,
  `remember`, `emptyMessage`, `run` (acción sobre el Commander), `vscode`, `url`
- Cadenas de interfaz en inglés; el español sale de Rcmdr (`build/Rcmdr-es.po`) o de `i18n/es.manual.json`
  (solo lo propio de la extensión y lo incomprensible de Rcmdr); lo que falta queda en `build/missing-es.txt`
- Títulos de menú siempre los de Rcmdr

## Pruebas

```sh
make test
```

- `tests/catalog.js`: cada comando × 2 estilos × 2 juegos de opciones, ejecutado en R (`ONLY=id1,id2`, `DIALOG_ONLY=1`)
- `tests/options.js`, `formmodel.js`, `report.js`, `tree.js`, `terminal.js`, `hover.js`, `view.js`, `rcmdr.js`,
  `extension.js`, `runner.R`
- Las pruebas son sin ventanas: `tests/headless.js` desactiva `rgl` y la pantalla

## Limitaciones

- Sin ventana Tk de R Commander
- Sin comandos: *Cerrar desde Commander*, *Guardar opciones de Rcmdr*, *App Nap* (macOS), *Instalar software auxiliar*
- El documento R Markdown / knitr se edita en VS Code, no en el editor de Rcmdr
- La identificación con el ratón necesita X11 o XWayland

## Créditos y licencia

- Menús, etiquetas y traducción: paquete [Rcmdr](https://cran.r-project.org/package=Rcmdr) de John Fox y
  colaboradores (GPL ≥ 2); `build/Rcmdr-menus.txt` y `build/Rcmdr-es.po` son copias
- Funciones de `car`, `RcmdrMisc`, `effects`, `aplpack`, `lme4`, `rgl` y demás paquetes
- Sin archivo de licencia todavía: debe ser compatible con la GPL de los archivos de Rcmdr
