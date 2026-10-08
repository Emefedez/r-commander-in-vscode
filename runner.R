run_code <- function(code, skip_help = TRUE, skip_commands = character(),
                     limit_output = TRUE, max_output_items = 24L, require = character(),
                     quiet = FALSE) {
  try(patch_view(), silent = TRUE)
  for (pkg in require) {
    if (!requireNamespace(pkg, quietly = TRUE)) {
      stop("Package '", pkg, "' is required. Install it from the R Commander menu (Tools > Install package(s)...) or with: ",
           "install.packages(\"", pkg, "\", repos = \"https://cloud.r-project.org\")", call. = FALSE)
    }
  }
  if (!quiet) message("R Play: ", if (limit_output) paste0("preview ", max_output_items, " entries") else "normal output",
          "; help skipping ", if (skip_help) "ON" else "OFF",
          if (length(skip_commands)) paste0("; skipping ", paste(skip_commands, collapse = ", ")) else "")
  if (limit_output) {
    if (length(max_output_items) != 1L || !is.numeric(max_output_items) ||
        !is.finite(max_output_items) || max_output_items < 1L ||
        max_output_items > 1000000L || max_output_items != floor(max_output_items)) {
      stop("Output preview size must be a whole number between 1 and 1000000.")
    }
    previous <- options(max.print = as.integer(max_output_items))
    on.exit(options(previous), add = TRUE)
  }

  # Source references retain skipped lines in echoed output after subsetting.
  # Deparse the remaining expressions so only executed commands are echoed.
  expressions <- parse(text = code, keep.source = FALSE)

  command_name <- function(expression) {
    if (!is.call(expression)) return("")
    head <- expression[[1L]]
    if (is.symbol(head)) return(as.character(head))
    if (is.call(head) && as.character(head[[1L]]) %in% c("::", ":::")) {
      return(paste0(as.character(head[[2L]]), "::", as.character(head[[3L]])))
    }
    ""
  }

  names <- vapply(expressions, command_name, character(1))
  unqualified <- sub("^.*::", "", names)
  skip <- names %in% skip_commands | unqualified %in% skip_commands
  if (skip_help) {
    skip <- skip | unqualified %in% c("?", "??", "help", "help.search")
  }

  if (any(skip)) {
    message("Skipped: ", paste(unique(names[skip]), collapse = ", "))
  }
  if (all(skip)) return(invisible(NULL))

  source(exprs = expressions[!skip], local = globalenv(), echo = TRUE,
         max.deparse.length = Inf)
}


# Answers a query from the editor: evaluates `expr` in the global environment and
# writes the result, one element per line, to `file` (atomically, so the editor
# never reads a half-written file).
write_query <- function(file, expr) {
  # Evaluate where the runner's helpers (session_info) are visible; the parent of
  # that environment is the global environment, so the user's objects are too.
  out <- tryCatch(as.character(eval(parse(text = expr), environment(write_query))),
                  error = function(e) character())
  tmp <- paste0(file, ".tmp")
  writeLines(enc2utf8(out), tmp, useBytes = TRUE)
  file.rename(tmp, file)
  invisible(NULL)
}

# One tab-separated record per line: D data frame, V variable, M model, H hclust
# solution, O any other object name.
session_info <- function() {
  env <- globalenv()
  out <- character()
  for (n in ls(env)) {
    o <- tryCatch(get(n, envir = env), error = function(e) NULL)
    out <- c(out, paste("O", n, sep = "\t"))
    if (is.data.frame(o)) {
      out <- c(out, paste("D", n, nrow(o), ncol(o), sep = "\t"))
      for (v in names(o)) {
        x <- o[[v]]
        kind <- if (is.factor(x)) "factor" else if (is.logical(x)) "logical"
                else if (is.numeric(x)) "numeric" else if (is.character(x)) "character"
                else "other"
        nlev <- if (is.factor(x)) nlevels(x) else if (is.character(x) || is.logical(x))
                  length(unique(x[!is.na(x)])) else 0L
        disc <- is.numeric(x) && length(unique(x[!is.na(x)])) <= 10L &&
                all(x[!is.na(x)] == floor(x[!is.na(x)]))
        out <- c(out, paste("V", n, v, kind, nlev, if (isTRUE(disc)) 1L else 0L, sep = "\t"))
      }
    } else if (inherits(o, "hclust")) {
      out <- c(out, paste("H", n, sep = "\t"))
    } else if (inherits(o, c("lm", "glm", "multinom", "polr", "merMod"))) {
      out <- c(out, paste("M", n, class(o)[1L], sep = "\t"))
    }
  }
  out
}

# Makes the functions of R Commander and its plug-ins available in the session,
# as library(Rcmdr) does, but without opening the Tk window: the packages Rcmdr
# and each plug-in depend on are attached, and the exports of Rcmdr and the
# plug-ins go in one search-path entry. An empty `plugins` means every installed
# RcmdrPlugin.* package. Safe to call on every run.
attach_rcmdr <- function(plugins = character()) {
  entry <- "Rcmdr functions"
  if (entry %in% search()) return(invisible(TRUE))
  if (!requireNamespace("Rcmdr", quietly = TRUE)) return(invisible(FALSE))
  if (!length(plugins)) {
    plugins <- grep("^RcmdrPlugin\\.", .packages(all.available = TRUE), value = TRUE)
  }
  plugins <- plugins[vapply(plugins, requireNamespace, logical(1), quietly = TRUE)]
  quietly <- function(expr) suppressWarnings(suppressMessages(expr))
  depends <- function(pkg) {
    field <- utils::packageDescription(pkg)$Depends
    if (is.null(field)) return(character())
    names <- trimws(sub("\\(.*$", "", strsplit(field, ",")[[1L]]))
    setdiff(names, c("R", "base", "stats", "graphics", "grDevices", "utils", "datasets", "methods"))
  }
  for (pkg in unique(unlist(lapply(c("Rcmdr", plugins), depends)))) {
    if (!paste0("package:", pkg) %in% search() && requireNamespace(pkg, quietly = TRUE)) {
      quietly(library(pkg, character.only = TRUE))
    }
  }
  env <- attach(NULL, name = entry)
  for (pkg in c("Rcmdr", plugins)) {
    namespace <- asNamespace(pkg)
    for (name in getNamespaceExports(pkg)) {
      assign(name, get(name, envir = namespace), envir = env)
    }
  }
  message("R Play: R Commander functions loaded (", paste(c("Rcmdr", plugins), collapse = ", "), ")")
  invisible(TRUE)
}

# The viewer of the R extension writes lists as JSON, which fails for lists that
# carry a class jsonlite does not know (a histogram, a test result...), so clicking
# such an object in the Workspace panel raised "No method asJSON S3 class".
# Convert the object into a plain list the viewer can write, element by element:
# classes are dropped, functions and calls become their source text.
json_safe <- function(x, depth = 0L) {
  if (depth > 12L) return(paste(utils::capture.output(utils::str(x, max.level = 1L)), collapse = "\n"))
  if (is.function(x) || is.language(x) || is.environment(x)) return(paste(deparse(x), collapse = "\n"))
  if (is.data.frame(x)) return(x)
  if (is.list(x)) return(lapply(unclass(x), json_safe, depth + 1L))
  if (is.null(oldClass(x))) return(x)
  ok <- !inherits(try(jsonlite::toJSON(x, auto_unbox = TRUE), silent = TRUE), "try-error")
  if (ok) x else tryCatch(as.vector(unclass(x)), error = function(e) paste(format(x), collapse = " "))
}

# Wrap View(): the original viewer goes first, so tables and ordinary objects
# behave exactly as before. Only if it fails, retry with the object made
# JSON-safe, and as a last resort show its structure as text.
patch_view <- function() {
  ns <- asNamespace("utils")
  current <- get("View", envir = ns)
  if (isTRUE(attr(current, "rcp_fallback"))) return(invisible(FALSE))
  wrapped <- function(x, title = deparse(substitute(x))) {
    force(title)
    tryCatch(current(x, title), error = function(first) {
      tryCatch(current(json_safe(x), title),
               error = function(second) current(utils::capture.output(utils::str(x)), title))
    })
  }
  attr(wrapped, "rcp_fallback") <- TRUE
  for (env in Filter(Negate(is.null), list(ns, if ("package:utils" %in% search()) as.environment("package:utils")))) {
    locked <- bindingIsLocked("View", env)
    if (locked) unlockBinding("View", env)
    assign("View", wrapped, envir = env)
    if (locked) lockBinding("View", env)
  }
  invisible(TRUE)
}
