# R Commander Play

Extensión de VS Code para trabajar con R al estilo de **R Commander**, sin salir del editor:

- un **botón verde ▶** que ejecuta la selección o el archivo completo con la salida visible, y
- los **menús de R Commander** (Fichero, Editar, Datos, Estadísticos, Gráficas, Modelos, Distribuciones,
  Herramientas, Ayuda) con sus diálogos, que generan y ejecutan el código R por ti.

Funciona encima de la extensión [REditorSupport.r](https://marketplace.visualstudio.com/items?itemName=REditorSupport.r)
(que aporta el terminal de R, los gráficos y la ayuda). No abre la ventana Tk de R Commander.
Los menús en español y en inglés salen del propio paquete Rcmdr.

## Contenido

1. [Qué incluye](#qué-incluye)
2. [Instalación](#instalación)
3. [Uso](#uso)
4. [Ajustes](#ajustes)
5. [El botón verde](#el-botón-verde)
6. [Estructura del repositorio](#estructura-del-repositorio)
7. [Añadir o cambiar un comando](#añadir-o-cambiar-un-comando)
8. [Pruebas](#pruebas)
9. [Limitaciones](#limitaciones)
10. [Créditos y licencia](#créditos-y-licencia)

## Qué incluye

- **Menú R Commander**: submenú dentro del menú **⋯** de cualquier archivo R, con 250 comandos y la barra de
  herramientas de Rcmdr (conjunto de datos activo, editar, visualizar, modelo activo).
- **Formulario en una sola ventana** (como Rcmdr): listas de variables una al lado de otra, botones de opción,
  casillas, campos de texto y los botones *Aceptar*, *Aplicar*, *Cancelar* y *Reiniciar*. Las variables salen de
  los data frames de tu sesión de R. Hay tablas para reordenar niveles, renombrar variables y escribir
  contrastes.
- **Árbol en la barra lateral de R**: los mismos menús, con icono y color por menú y una línea fina donde
  Rcmdr tiene separadores.
- **Hover**: al pasar el ratón sobre una llamada a una función de R (`t.test(`, `Hist(`, `pie(`...) dice en qué
  parte del menú de R Commander está, con un enlace que abre el diálogo.
- **Funciones de R Commander disponibles en la sesión** (`Recode`, `Hist`, `calcular_frecuencia`...), cargadas
  sin abrir la ventana Tk: se enlazan los paquetes de los que depende Rcmdr y los complementos
  `RcmdrPlugin.*` instalados.
- **Botón de limpiar terminal** junto al play verde.
- **Arreglo del visor del Workspace** para listas con clase (por ejemplo un `histogram`), que daban
  `No method asJSON S3 class`.
- **Español por defecto** (diálogos, menús y árbol), con inglés opcional.

## Instalación

Requisitos: VS Code ≥ 1.85, R, la extensión REditorSupport.r y, para casi todos los comandos, el paquete
`Rcmdr` con sus dependencias (`car`, `RcmdrMisc`...). Algunos comandos piden paquetes extra
(`aplpack`, `rgl`, `leaps`, `lme4`, `nnet`...): *Herramientas ▸ Instalar paquete(s)...* los instala siempre desde
`cloud.r-project.org`.

```sh
make install          # genera, empaqueta dist/r-commander-play-<versión>.vsix e instala en VS Code
# o a mano:
make package          # solo crea el .vsix
code --install-extension dist/r-commander-play-*.vsix --force
```

Después, **Developer: Reload Window**.

## Uso

1. Abre un archivo R y carga o crea datos (*Datos ▸ Cargar conjunto de datos...*, *Importar datos*, o un `data(iris)` en
   tu script). El conjunto activo aparece en la barra de estado.
2. Abre el menú **⋯ ▸ R Commander** (o la vista *R Commander* de la barra lateral de R) y elige un comando.
3. Rellena el formulario y pulsa **Aceptar**. El código R generado se ejecuta en el terminal de R con eco.

Con `rCommanderPlay.menuAction` puedes hacer que el código solo se **inserte** al final del script (como la
ventana de script de Rcmdr) o que se inserte **y** se ejecute.

Los comandos que en Rcmdr abren su propia ventana (`View`, ayuda, gráficos, editor de datos) usan los visores
de REditorSupport o las ventanas de R.

## Ajustes

| Ajuste | Por defecto | Qué hace |
| --- | --- | --- |
| `rCommanderPlay.language` | `es` | Idioma de los diálogos y del árbol (`es`, `en`, `auto`). Las etiquetas de los menús se fijan al arrancar VS Code: usa **R Commander: Cambiar idioma (English / Español)** y recarga la ventana. |
| `rCommanderPlay.dialogStyle` | `form` | `form`: una ventana con todo. `steps`: una pregunta cada vez en la barra superior. |
| `rCommanderPlay.menuAction` | `run` | `run`, `insert` o `both`. |
| `rCommanderPlay.loadRcmdrFunctions` | `true` | Carga las funciones de Rcmdr y sus complementos antes de cada ejecución. |
| `rCommanderPlay.rcmdrPlugins` | `[]` | Complementos a cargar; vacío = todos los `RcmdrPlugin.*` instalados. |
| `rCommanderPlay.skipHelp`, `skipCommands` | `true`, `[]` | Qué omite el botón verde (ver más abajo). |
| `rCommanderPlay.limitOutput`, `maxOutputItems` | `true`, `24` | Vista previa de resultados largos. |

## El botón verde

El botón ▶ verde (a la izquierda de *Run Source*) ejecuta la selección o, si no hay selección, guarda y ejecuta
todo el archivo en el terminal de R interactivo. Los gráficos, la ayuda y las variables siguen funcionando como
siempre; `Ctrl+Enter` conserva su comportamiento.

- **Omitir ayuda** (`?x`, `??x`, `help(...)`, `help.search(...)`) y **comandos a omitir** (`fix, View, utils::example`):
  se filtran expresiones sueltas del nivel superior; lo que está dentro de funciones, cadenas o comentarios se
  conserva. Los comandos de los menús ignoran esta opción.
- **Limitar salidas largas**: muestra una vista previa de vectores, matrices y data frames (24 entradas por
  defecto) usando `max.print` y lo restablece después de cada ejecución.
- La barra de estado muestra el estado de estas opciones; al pulsarla se abre *Configurar el botón verde*.

## Estructura del repositorio

```
extension.js        activación: botón verde, comandos, árbol, hover, barra de estado
runner.R            lo que se ejecuta en R: run_code, consultas a la sesión, funciones de Rcmdr, visor
lib/
  commander.js      flujo de un comando: conjunto/modelo activo → diálogo → código → ejecutar/insertar
  form.js           formulario (webview) y su ciclo de mensajes
  formmodel.js      lógica del formulario sin VS Code: valores iniciales, visibilidad, validación
  dialog.js         estilo "steps" (preguntas una a una)
  rsession.js       habla con el terminal de R (ejecutar, consultar mediante un archivo)
  tree.js, hover.js árbol de la barra lateral y hover con la ruta del menú
  i18n.js, rhelpers.js
catalog/            un objeto por comando de Rcmdr: campos del diálogo y código R que genera
build/              generate.js (package.json, traducciones, datos), functions.js, package.sh,
                    Rcmdr-menus.txt y Rcmdr-es.po (tomados de Rcmdr)
data/ i18n/         generado por build/generate.js (no se edita a mano, salvo i18n/es.manual.json)
tests/              pruebas (ver más abajo)
```

`package.json`, `package.nls*.json` y `data/` se **generan**: la fuente es `build/package.base.json`, el catálogo y
los dos archivos de Rcmdr. Tras tocar el catálogo ejecuta `make generate`.

## Añadir o cambiar un comando

Cada comando es una entrada de `catalog/*.js` con el nombre de su función en Rcmdr (el mismo que en
`build/Rcmdr-menus.txt`, que fija su lugar en el menú):

```js
singleSampleTTest: {
  pkgs: ['car'],                       // paquetes que debe tener R (opcional)
  fields: [                            // lo que pide el formulario, en orden
    numVar('x', 'Variable (pick one)'),
    alt('Population mean < mu0', 'Population mean > mu0'),
    { k: 'mu', type: 'num', label: 'Null hypothesis: mu =', def: '0.0' },
    conf
  ],
  code: (v, c) => `t.test(${c.dv(v.x)}, alternative = ${rs(v.alt)}, mu = ${v.mu}, conf.level = ${v.conf})`
}
```

- Tipos de campo: `var` (una o varias variables, filtradas por `kind`), `dataset`, `model`, `models`, `hclust`,
  `choice`, `flags`, `num`, `numlist`, `text`, `name`, `file`, `dir`, `installed`, `rlist` (lista que sale de una
  consulta a R), `levelorder`, `renames` y `matrix` (tablas).
- `when: v => ...` muestra el campo solo en cierto caso; `exclude` evita repetir variables; `optional`, `def`,
  `min`, `max`, `pattern` validan.
- Otras claves: `ds: false` (no necesita conjunto de datos), `needsModel`, `activeDataset`/`activeModel` (qué
  queda activo), `after` (preguntas extra), `vscode` y `url` (acciones que no generan código R).
- Las cadenas de interfaz van en inglés; el español sale de la traducción de Rcmdr o de `i18n/es.manual.json`.
  `build/generate.js` avisa en `build/missing-es.txt` de lo que no tiene traducción.

## Pruebas

```sh
make test
```

- `tests/catalog.js` pasa **todos** los comandos por los dos estilos de diálogo, con dos juegos de elecciones
  (primeras y últimas opciones), y ejecuta cada fragmento generado en una sesión real de R. Necesita `Rscript`
  con `Rcmdr` y sus dependencias. Fallan a propósito solo los comandos que dependen del entorno: archivos
  de importación reales, URL, y los paquetes `rgl` y `leaps` si no están instalados.
- `tests/options.js` cubre combinaciones que el barrido no alcanza (contrastes, efectos, tallo y hojas).
- `tests/formmodel.js`, `hover.js`, `view.js`, `rcmdr.js`, `extension.js` y `runner.R` comprueban la lógica del
  formulario, el hover, el visor, la carga de funciones de Rcmdr (y que el play verde siga dibujando gráficos),
  el registro de comandos y el filtrado del botón verde.

## Limitaciones

- No incluidos: edición de documentos Rmd/knitr, *Guardar salida*, análisis factorial confirmatorio (necesita
  `sem`), gráficos 3D de componentes y variables añadidas, e identificación de puntos con el ratón.
- Los comandos que usan `rgl` o `leaps` piden instalarlos.
- El formulario se ha comprobado con renders en un navegador y con simulaciones de VS Code; el aspecto del árbol
  (colores, separadores) y del hover depende del tema de VS Code. Si algo se ve distinto, abre una incidencia.

## Créditos y licencia

Los menús, las etiquetas y la traducción al español salen del paquete [Rcmdr](https://cran.r-project.org/package=Rcmdr)
de John Fox y colaboradores (GPL ≥ 2): `build/Rcmdr-menus.txt` y `build/Rcmdr-es.po` son copias de sus
archivos, y el código R que se genera sigue las convenciones de sus diálogos. Las funciones de gráficos y
análisis son de `car`, `RcmdrMisc`, `effects`, `aplpack`, `lme4` y demás paquetes citados.

Este repositorio aún no tiene archivo de licencia. Si se publica, debe ser compatible con la GPL de los archivos
de Rcmdr que incluye.
