# AGENTS.md

Notas para quien (persona o agente) trabaje en este repositorio: cómo está montado, qué está hecho, qué se está
haciendo y qué queda. Léelo antes de tocar nada y **actualízalo al terminar** cada tarea.

Última actualización: 2026-10-12.
Ubicación del repositorio: `~/Work/r-commander-play` (antes estaba dentro de `ESTI/Practica I/.vscode/`).
Los `.vsix` antiguos de esa carpeta (0.1.0–0.5.0) no forman parte del repositorio.

## Qué es

Extensión de VS Code (`local-tools.r-commander-play`) que ejecuta código R con salida visible (botón verde) y
reproduce los menús de R Commander con formularios. Funciona sobre REditorSupport.r. El README explica el uso; aquí
va lo que hace falta para trabajar en el código.

## Cómo trabajar

```sh
make generate   # regenera package.json, package.nls*.json, data/ e i18n/es.json (NO se editan a mano)
make test       # todas las pruebas; tests/catalog.js ejecuta cada comando en R de verdad (tarda varios minutos)
make install    # empaqueta e instala en VS Code; luego "Developer: Reload Window"
```

- Los **comandos** viven en `catalog/*.js`, uno por función de Rcmdr (mismo nombre que en `build/Rcmdr-menus.txt`).
  Campos y claves del DSL: README, sección "Añadir o cambiar un comando".
- Las cadenas de interfaz van **en inglés** en el código. El español sale de la traducción de Rcmdr
  (`build/Rcmdr-es.po`) o de `i18n/es.manual.json`; `build/generate.js` lista lo que falta en
  `build/missing-es.txt` (ignorado por git). Entradas de Rcmdr sin traducción se quedan en inglés.
- `package.json` se genera desde `build/package.base.json` + el catálogo + los menús de Rcmdr.
- Código R que genera cada comando: estilo de Rcmdr (nombres de objeto `RegModel.1`, `.Table`...) y siempre
  verificado ejecutándolo (ver pruebas). No añadas un comando sin que `tests/catalog.js` lo ejecute.

## Decisiones y lecciones (por qué está como está)

- **El terminal solo recibe `source("<archivo>")`.** `lib/rsession.js` escribe cada ejecución/consulta en un archivo de
  trabajo (`os.tmpdir()/rcp-<pid>-<n>.R`) que se borra solo; el runner se carga una vez en el entorno `R Play` de
  la ruta de búsqueda (no ensucia `ls()`), con sello de versión para recargarse si la extensión se actualiza.
- **El eco conserva el código original** (`run_code` en `runner.R` usa `srcref`): comentarios, espaciado y
  funciones de varias líneas; las líneas omitidas (`?x`, `help()`) no se muestran. Un error del script se ve
  como `Error: msg` y detiene la ejecución, y sigue siendo un error de R capturable.
- **Las consultas a R** (`session.query`) se evalúan en el entorno global; los helpers están en `R Play`.
  Un bug anterior ("no hay conjuntos de datos") venía de evaluar fuera de ese alcance, y las pruebas lo escondían
  porque cargaban el runner de otra manera: las pruebas usan **el mismo comando que la extensión**.
- **Hover**: VS Code pone primero el proveedor registrado más tarde y el servidor de lenguaje de R registra el suyo
  tras arrancar. Por eso `extension.js` re-registra el hover a los 6 s, a los 15 s y al activar un archivo R.
  No usar `exclusive` (ocultaría la documentación de R).
- **Visor del Workspace**: `patch_view()` (runner) envuelve `utils::View`: primero el visor original, y solo si falla
  convierte el objeto a lista JSON-compatible; texto como último recurso. No se modifica la extensión R.
- **Instalación de paquetes**: siempre `cloud.r-project.org` (o el mirror configurado), `timeout` alto, y solo se
  descarga lo que falta. Sin repositorio, un R de terminal espera a que elijas mirror y parece colgado.
- Importadores: `foreign` primero y `haven` como alternativa (SPSS/Stata/SAS modernos que `foreign` no lee).
- Rcmdr solo hace `load(file)` en "Cargar conjunto de datos" y falla con varios objetos; aquí se eligen los
  conjuntos y se abren `.rds`, texto/CSV y Excel.

## Estado

### Hecho (probado)
- Botón verde, filtrado de ayuda/comandos, vista previa de salidas largas; botón de limpiar terminal; botón verde a la
  izquierda de *Run Source* (`navigation@-2`).
- 358 comandos (menú de R Commander + complemento RcmdrPlugin.TeachStat, selector de conjunto de datos en el formulario) con formulario en una ventana (webview) o en pasos (`dialogStyle`), árbol
  lateral con colores/separadores, hover con la ruta del menú, carga de funciones de Rcmdr y complementos sin la
  ventana Tk, español por defecto.
- Campos de tabla (orden de niveles, renombrar, matriz de contrastes), listas dependientes del archivo y de R.
- Opciones de Rcmdr comparadas diálogo por diálogo (títulos y etiquetas de ejes, gráfico circular, densidad, QQ,
  Xyplot, modelos con subconjunto/ponderaciones, medidas repetidas, sándwich...).
- Tallo y hojas completo (`aplpack`), contrastes personalizados, términos/predictores en gráficos de efectos,
  análisis factorial confirmatorio (`sem`).
- Importadores con alternativa `haven`; "Cargar conjunto de datos" ampliado; "Instalar paquete(s)" sin reinstalar
  lo ya instalado.
- Terminal limpio (`source(...)`) y eco fiel; arreglo del visor del Workspace.
- Pruebas: `tests/catalog.js` (cada comando × 2 estilos × 2 juegos de opciones, ejecutado en R), `options.js`,
  `terminal.js`, `rcmdr.js`, `view.js`, `hover.js`, `formmodel.js`, `extension.js`, `runner.R`.

### Hecho en la última tanda (probado)
- **Colores de sintaxis opcionales**: `rCommanderPlay.syntaxColors` (desactivado por defecto), comando con
  interruptor *Colorear sintaxis en el terminal* y opción en los ajustes del botón verde. Se pasa al runner tanto
  desde el botón como desde los menús. `color_source()` usa `getParseData()` y ANSI de la paleta del terminal:
  conserva Unicode, tabuladores y cadenas multilínea, sin modificar los métodos de impresión de resultados.
- **Búsqueda del árbol**: lupa en la cabecera, caja nativa de búsqueda que filtra al escribir, conserva las rutas
  y expande los menús con resultados; busca en español e inglés, sin distinguir tildes o mayúsculas, también por
  ID. Seleccionar abre el comando; *Quitar filtro de búsqueda* restaura el árbol completo.
  Pruebas en `tests/tree.js`, `tests/extension.js` y `tests/runner.R`; `make test` incluye también `tests/terminal.js`.
  Validación completa: 1320 fragmentos sin problemas de diálogo, 1312 correctos y los 8 fallos conocidos por falta
  de `rgl`; pruebas de búsqueda, alternancia de colores y conservación del eco/resultados correctas. Paquete
  0.5.0 reinstalado; recargar la ventana de VS Code para ver los comandos nuevos.
- **Revisión del español de R Play**: traducciones naturales y terminología coherente en menús, árbol, hover y
  formularios. Correcciones en `i18n/es.manual.json` (no editar los `.po` ni los JSON generados): chi-cuadrado de
  ajuste con categorías equiprobables, agrupación en intervalos, índices de ajuste, leyendas, contrastes y
  distribuciones. Términos breves en inglés cuando resultan más claros (`bootstrap`, `jitter`, `scree plot`,
  `kernel`, `dummy`). Pruebas de hover adaptadas a las nuevas etiquetas; paquete 0.5.0 reinstalado en VS Code.
  Validación: `make test`, 1320 fragmentos sin problemas de diálogo; 1312 correctos y los 8 fallos conocidos de
  gráficos 3D por falta de `rgl`. Marcadores `{0}` y traducciones de los manifiestos verificados; código R y
  etiquetas inglesas sin cambios.
- **Instalador de paquetes de R** (el usuario intentó `utils::menuInstallPkgs()`, que es de RGui/Windows): en
  *Herramientas*: *Instalar paquete(s)...* (elige mirror de una lista descargada de CRAN con la local como respaldo,
  lista de paquetes de ese mirror con filtro, solo descarga lo que falta), *Actualizar paquetes...*, *Instalar desde
  archivos locales...*, *Elegir mirror de CRAN...*, *Paquetes instalados...* e *Interrumpir R*.
- **Descargas permanentes** (opción marcada por defecto): los archivos van a `rCommanderPlay.packageDownloads`
  (`~/.cache/r-commander-play/packages`), que además es un repositorio local indexado que se consulta antes que CRAN,
  así que un paquete ya descargado no se vuelve a bajar. Probado con un servidor HTTP local (`tests/options.js`):
  la reinstalación funciona con un mirror inaccesible; sin la opción, falla (control).
- **Botones de la barra** (de izquierda a derecha): interrumpir R, instalar paquetes, limpiar terminal, play verde,
  *Run Source*.
- Pruebas del instalador sin red ni tocar la biblioteca real: `tests/make-repo.R` crea un repositorio CRAN
  diminuto y una biblioteca propia (`R_LIBS`).

- **Cerrar los menús al elegir** (2026-10-12): `rCommanderPlay.closeMenusAfterChoice` (desactivado por defecto,
  ajuste de usuario/Global) y comando con marca *Cerrar los menús al elegir una opción* en el menú ⋯ de la cabecera
  del árbol. Las hojas del árbol llaman a `rCommanderPlay.chooseMenuItem` (no contribuido; pliega si toca y abre
  `rcp.cmd.<id>`). Plegar = dar ids nuevos a los elementos (`generation` en `lib/tree.js`), porque VS Code guarda el
  estado desplegado por id; también al cambiar el filtro, para que los resultados salgan desplegados. Con búsqueda
  activa no se pliega. Pruebas en `tests/tree.js` y `tests/extension.js`; `make test`: 1312/1320 (los 8 de `rgl`).
  Falta verlo en la ventana real de VS Code.

### En curso
- Nada abierto. Pendiente de confirmar con el usuario: a qué se refiere con "la salida de la instalación es distinta
  a la de R Commander" (pegó la salida de *Cargar paquete(s)*).

### Pendiente / bloqueado
- `rgl` (Scatter3D, Guardar gráfico 3D): su instalación falla con `failed to lock directory ... for modifying`,
  es decir, un bloqueo `00LOCK-rgl` antiguo en la biblioteca de usuario (probablemente de la descarga atascada).
  **Hay que preguntar antes de borrarlo** (el usuario rechazó que lo inspeccionara). Esos dos comandos son los
  únicos 8 fallos de `tests/catalog.js` (1312/1320 en el barrido del 2026-10-08).
- `importMinitab` y `CFA` se comprueban en el barrido solo como código (no hay un archivo `.mtp` de ejemplo; CFA
  necesita datos con estructura factorial, que sí se ejecutan en `tests/options.js`).
- Probar todo en la ventana real de VS Code del usuario (hasta ahora se ha probado con renders en un navegador y
  con simulaciones de la API de VS Code).
- Licencia del repositorio: `build/Rcmdr-menus.txt` y `build/Rcmdr-es.po` vienen de Rcmdr (GPL ≥ 2); decidir y añadir
  un `LICENSE` compatible antes de publicar.

## Reglas de trabajo

- No tocar la extensión REditorSupport.r ni la configuración de R del usuario sin permiso explícito. El usuario
  autorizó instalar paquetes de R para que pasen las pruebas (`aplpack` ya instalado); no borrar bloqueos ni
  procesos sin preguntar.
- Antes de dar algo por hecho: `make test`. Si una prueba falla por el entorno, dilo, no la quites.
- Commits pequeños y con mensaje en español; el repositorio es privado (`Emefedez/r-commander-play`).

## Carga perezosa de las funciones de Rcmdr
- `attach_rcmdr_if_used()` (runner.R) solo adjunta Rcmdr y sus dependencias (~250 MB, ~100 espacios de nombres) si el código a ejecutar menciona un nombre de `data/rcmdr-names.txt` que el usuario no tiene ya. Regenerar con `make names` al cambiar de versión de Rcmdr/complementos.
