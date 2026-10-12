runner <- new.env(parent = baseenv())
# Path of this file, so the test works from any directory
here <- dirname(normalizePath(sub("^--file=", "", grep("^--file=", commandArgs(FALSE), value = TRUE)[1L])))
sys.source(file.path(here, "..", "runner.R"), runner)

help <- function(...) stop("Help should have been skipped")
help.search <- help
fix <- function(...) stop("fix should have been skipped")

code <- paste(c(
  "?sample", "??sample", 'help("sample")', 'utils::help("sample")',
  'help.search("sample")', 'utils::help.search("sample")',
  'fix(stop("Arguments should not be evaluated"))',
  'play_text <- "literal ?sample; fix(x)"',
  'play_multiline <- "first line\n?sample\nlast line"',
  'play_value <- 41', 'play_value + 1',
  'play_function <- function() { help("sample"); "?sample" }'
), collapse = "\n")
messages <- character()
output <- capture.output(withCallingHandlers(
  runner$run_code(code, skip_commands = "fix"),
  message = function(m) {
    messages <<- c(messages, conditionMessage(m))
    invokeRestart("muffleMessage")
  }
))
stopifnot(play_value == 41, play_text == "literal ?sample; fix(x)",
          play_multiline == "first line\n?sample\nlast line",
          is.function(play_function), any(grepl("42", output)),
          any(grepl("Skipped:", messages)),
          !any(grepl("^> \\?", output)),
          !exists("run_code", envir = .GlobalEnv, inherits = FALSE))

# Turning the option off executes help, while an empty custom list permits calls.
help <- function(...) play_help_called <<- TRUE
fix <- function(...) play_fix_called <<- TRUE
invisible(capture.output(runner$run_code('help("x"); fix("x")', skip_help = FALSE)))
stopifnot(play_help_called, play_fix_called)

# Qualified custom names skip only that namespace, and unqualified names match both.
invisible(capture.output(runner$run_code(
  'base::stop("skip me"); play_namespace <- TRUE',
  skip_commands = "base::stop"
)))
stopifnot(play_namespace)
invisible(capture.output(runner$run_code('base::stop("skip me")', skip_commands = "stop")))

# An all-skipped selection and an empty selection complete without sourcing errors.
invisible(capture.output(runner$run_code('?sample')))
invisible(capture.output(runner$run_code('# comment only')))

# Long implicit and explicit results show a preview without changing their values.
original_max <- getOption("max.print")
preview <- capture.output(runner$run_code(
  'play_long <- rep(c(TRUE, FALSE), 5000); play_long; length(play_long); print(play_long)',
  max_output_items = 24L
))
stopifnot(length(play_long) == 10000L, identical(getOption("max.print"), original_max),
          sum(grepl("omitted 9976 entries", preview)) == 2L,
          any(grepl("10000", preview)), length(preview) < 25L)

# Normal output can be restored, and changing the preview size takes effect.
options(max.print = 1000L)
full <- capture.output(runner$run_code('rep(TRUE, 200)', limit_output = FALSE))
stopifnot(!any(grepl("omitted", full)), getOption("max.print") == 1000L)
short <- capture.output(runner$run_code('rep(TRUE, 200)', max_output_items = 12L))
stopifnot(any(grepl("omitted 188 entries", short)), getOption("max.print") == 1000L)

# Data frames use the same limit, and failures also restore the session option.
table_preview <- capture.output(runner$run_code('data.frame(a=1:100, b=1:100)'))
stopifnot(any(grepl("omitted 88 rows", table_preview)))
invisible(capture.output(tryCatch(
  runner$run_code('stop("expected error")'), error = function(e) NULL
)))
stopifnot(getOption("max.print") == 1000L)
tryCatch(runner$run_code('1 +', max_output_items = 12L), error = function(e) NULL)
stopifnot(getOption("max.print") == 1000L)
invalid <- tryCatch(runner$run_code('1', max_output_items = 0L), error = identity)
stopifnot(inherits(invalid, "error"), getOption("max.print") == 1000L)
options(max.print = original_max)

cat("R filtering and output preview checks passed.\n")

# Calls whose head is itself a call (f(x)(y), pkg::f(x)(y)) are ordinary code and must run.
curried_output <- capture.output(runner$run_code(paste(
  "make_adder <- function(n) function(x) x + n",
  "make_adder(2)(3)",
  "stats::setNames(c(a = 1, b = 2), c('p', 'q'))[['q']]",
  "(function() 7)()", sep = "\n"), skip_help = FALSE, limit_output = FALSE, quiet = TRUE))
stopifnot(any(grepl("^\\[1\\] 5$", curried_output)), any(grepl("^\\[1\\] 7$", curried_output)),
          any(grepl("^> make_adder\\(2\\)\\(3\\)$", curried_output)))
cat("Curried calls run.\n")

# Syntax color never changes the echoed source or the values printed by R.
color_code <- paste(c('# comentario con ñ', '\tcolor_á <- "sí # texto"',
  'color_raw <- r"(primera', 'segunda)"',
  'if (TRUE) {', '  print(12.5)', '}', '?sample', '# comentario final'), collapse = "\n")
plain <- capture.output(runner$run_code(color_code, quiet = TRUE))
colored <- capture.output(runner$run_code(color_code, quiet = TRUE, syntax_colors = TRUE))
stopifnot(identical(gsub("\033\\[[0-9;]*m", "", colored), plain),
          any(grepl("\033[90m# comentario", colored, fixed = TRUE)),
          any(grepl("\033[32m\"sí # texto\"\033[0m", colored, fixed = TRUE)),
          any(grepl("\033[35mif\033[0m", colored, fixed = TRUE)),
          any(grepl("\033[36m12.5\033[0m", colored, fixed = TRUE)),
          '[1] 12.5' %in% colored,
          !any(grepl("sample", colored)), identical(color_á, "sí # texto"),
          identical(color_raw, "primera\nsegunda"))
failed_color <- capture.output(tryCatch(runner$run_code('stop("boom")\nprint(99)',
  quiet = TRUE, syntax_colors = TRUE), error = function(e) NULL))
stopifnot(!any(grepl('99', failed_color)))
cat("Syntax colors preserve source, Unicode, tabs, multiline strings and printed results.\n")
