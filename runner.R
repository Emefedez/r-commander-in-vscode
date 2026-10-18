run_code <- function(code, skip_help = TRUE, skip_commands = character(),
                     limit_output = TRUE, max_output_items = 24L, require = character(),
                     quiet = FALSE, syntax_colors = FALSE) {
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

  # Keep the source text, so the echo shows the code as it was written (spacing and
  # comments included). Each expression is echoed from the end of the previous one, so
  # the comments above it come along, and the lines of skipped commands never do.
  expressions <- parse(text = code, keep.source = TRUE)
  srcfile <- attr(expressions, "srcfile")
  srcrefs <- attr(expressions, "srcref")
  display_lines <- sub("[ \t\r]+$", "", srcfile$lines)
  if (isTRUE(syntax_colors)) display_lines <- color_source(expressions, display_lines)

  command_name <- function(expression) {
    if (!is.call(expression)) return("")
    head <- expression[[1L]]
    if (is.symbol(head)) return(as.character(head))
    # A curried call such as pkg::f(x)(y) has a call as its head; only pkg::f is a name to look at.
    if (is.call(head) && is.symbol(head[[1L]]) && as.character(head[[1L]]) %in% c("::", ":::")) {
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

  source_lines <- function(first, last) {
    if (last < first) character() else display_lines[seq.int(first, last)]
  }
  # Comment lines get their own prompt; the expression gets "> " and then "+ " as R does.
  echo <- function(lines, expression_lines) {
    lines <- sub("[ \t\r]+$", "", lines)
    lead <- length(lines) - expression_lines
    while (lead > 0L && !nzchar(trimws(lines[1L]))) { lines <- lines[-1L]; lead <- lead - 1L }
    lead <- max(lead, 0L)
    prompts <- c(rep("> ", lead), "> ", rep("+ ", max(length(lines) - lead - 1L, 0L)))
    cat(paste0(prompts, lines), sep = "\n")
  }

  previous_end <- 0L
  for (i in seq_along(expressions)) {
    first <- srcrefs[[i]][1L]
    last <- srcrefs[[i]][3L]
    start <- if (previous_end >= first) first else previous_end + 1L
    lines <- source_lines(start, last)
    previous_end <- last
    if (skip[i]) next
    echo(lines, last - first + 1L)
    result <- tryCatch(withVisible(eval(expressions[[i]], globalenv())), error = function(e) {
      # An error at the top level of the script reads "Error: message", as in the console.
      call <- conditionCall(e)
      if (is.call(call) && identical(call[[1L]], quote(eval))) e$call <- NULL
      stop(e)
    })
    if (result$visible) print(result$value)
  }
  trailing <- source_lines(previous_end + 1L, length(srcfile$lines))
  trailing <- sub("[ \t\r]+$", "", trailing[nzchar(trimws(trailing))])
  if (length(trailing)) cat(paste0("> ", trailing), sep = "\n")
  invisible(NULL)
}

# Color the parsed source rather than guessing tokens with regexes. Results keep
# their own print methods, and every colored span resets the terminal palette.
color_source <- function(expressions, lines) {
  tokens <- utils::getParseData(expressions)
  if (is.null(tokens)) return(lines)
  colors <- c(COMMENT = "90", STR_CONST = "32", NUM_CONST = "36",
              SYMBOL_FUNCTION_CALL = "34", SYMBOL_PACKAGE = "34",
              FUNCTION = "35", IF = "35", ELSE = "35", FOR = "35",
              WHILE = "35", REPEAT = "35", IN = "35", NEXT = "35", BREAK = "35",
              LEFT_ASSIGN = "33", RIGHT_ASSIGN = "33", EQ_ASSIGN = "33",
              SPECIAL = "33", PIPE = "33")
  tokens <- tokens[tokens$terminal & tokens$token %in% names(colors), ]
  for (line in seq_along(lines)) {
    chars <- strsplit(lines[[line]], "", fixed = TRUE)[[1L]]
    if (!length(chars)) next
    # R's parser expands tabs to eight-column stops; Unicode uses character columns.
    columns <- integer(length(chars)); column <- 1L
    for (i in seq_along(chars)) {
      columns[[i]] <- column
      column <- if (chars[[i]] == "\t") column + 8L - (column - 1L) %% 8L else column + 1L
    }
    styles <- rep("", length(chars))
    spans <- tokens[tokens$line1 <= line & tokens$line2 >= line, ]
    for (i in seq_len(nrow(spans))) {
      span <- spans[i, ]
      first <- if (span$line1 == line) span$col1 else 1L
      last <- if (span$line2 == line) span$col2 else Inf
      styles[columns >= first & columns <= last] <- colors[[span$token]]
    }
    runs <- rle(styles); end <- cumsum(runs$lengths); start <- end - runs$lengths + 1L
    lines[[line]] <- paste0(vapply(seq_along(start), function(i) {
      text <- paste0(chars[seq.int(start[[i]], end[[i]])], collapse = "")
      if (nzchar(runs$values[[i]])) paste0("\033[", runs$values[[i]], "m", text, "\033[0m") else text
    }, character(1)), collapse = "")
  }
  lines
}


# Answers a query from the editor: evaluates `expr` in the global environment and
# writes the result, one element per line, to `file` (atomically, so the editor
# never reads a half-written file).
write_query <- function(file, expr) {
  # The helpers (session_info) are on the search path, the user's objects in the global environment.
  out <- tryCatch(as.character(eval(parse(text = expr), globalenv())),
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
        kind <- if (is.ordered(x)) "ordered" else if (is.factor(x)) "factor" else if (is.logical(x)) "logical"
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
# Attaches the R Commander functions only when `code` mentions one of their names (loading
# Rcmdr and its dependencies takes a few hundred MB, so plain R scripts should not pay for it).
attach_rcmdr_if_used <- function(code, names_file, plugins = character()) {
  if ("Rcmdr functions" %in% search() || !file.exists(names_file)) return(invisible(FALSE))
  used <- tryCatch({
    parsed <- parse(text = code, keep.source = TRUE)
    # Names in strings count too, e.g. contrasts(x) <- "contr.Treatment" needs car.
    tokens <- utils::getParseData(parsed)
    strings <- gsub("^[\"']|[\"']$", "", tokens$text[tokens$token == "STR_CONST"])
    c(all.names(parsed), strings)
  }, error = function(e) NULL)
  if (is.null(used)) return(invisible(FALSE))   # unparsable: run_code reports the syntax error
  used <- unique(used)
  used <- used[used %in% readLines(names_file, encoding = "UTF-8")]
  if (!length(used)) return(invisible(FALSE))
  # Names the user already has (own definitions, packages they attached) need nothing.
  if (all(vapply(used, exists, logical(1), envir = globalenv()))) return(invisible(FALSE))
  attach_rcmdr(plugins)
}

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
