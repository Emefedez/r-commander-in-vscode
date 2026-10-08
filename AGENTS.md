# AGENTS.md

Notas para quien (persona o agente) trabaje en este repositorio: cómo está montado, qué está hecho, qué se está
haciendo y qué queda. Léelo antes de tocar nada y **actualízalo al terminar** cada tarea.

Última actualización: 2026-10-08.
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
- 251 comandos del menú de R Commander con formulario en una ventana (webview) o en pasos (`dialogStyle`), árbol
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

### En curso (prioridad máxima)
- **Instalador de paquetes de R** (el usuario intentó `utils::menuInstallPkgs()`, que es de RGui/Windows y no existe
  aquí): lista de CRAN con filtro, instalar sin reinstalar, actualizar, instalar desde archivo local, elegir mirror
  (ajuste `rCommanderPlay.cranMirror`), listar instalados.
- **Herramientas en la barra**: botón de paquetes y botón de interrumpir R (Ctrl+C al terminal de R) junto al
  botón verde y la escoba.

### Pendiente / bloqueado
- `rgl` (Scatter3D, Guardar gráfico 3D): su instalación falla por un bloqueo antiguo `00LOCK-rgl` en la biblioteca
  de usuario (probablemente de la descarga atascada). **Hay que preguntar antes de borrarlo.** Mientras tanto esos
  dos comandos se prueban solo como código.
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
