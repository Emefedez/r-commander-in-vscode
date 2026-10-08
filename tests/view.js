// Clicking a classed list (a histogram) in the Workspace panel must not fail.
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const runner = JSON.stringify(path.join(__dirname, '..', 'runner.R'));
const script = `
calls <- list()
# Stand-in for the R extension's viewer: lists go through jsonlite, like the real one.
fake <- function(x, title = deparse(substitute(x))) {
  force(title)
  if (is.data.frame(x)) calls[[length(calls) + 1L]] <<- list("table", title)
  else if (is.list(x)) { jsonlite::write_json(x, tempfile(), auto_unbox = TRUE); calls[[length(calls) + 1L]] <<- list("list", title) }
  else calls[[length(calls) + 1L]] <<- list("text", title)
}
ns <- asNamespace("utils"); unlockBinding("View", ns); assign("View", fake, envir = ns)
e <- as.environment("package:utils"); unlockBinding("View", e); assign("View", fake, envir = e)

aa <- hist(c(1, 2, 2, 3, 3, 3, 4, 4, 5), plot = FALSE)
r <- tryCatch({ View(aa); "unpatched works" }, error = function(err) "unpatched fails")
cat("BEFORE:", r, "\\n")

local({ sys.source(${runner}, envir = environment()); patch_view(); patch_view() })
View(aa)                      # histogram: shown as a plain list in the normal viewer
View(list(h = aa, f = function(x) x + 1, n = 3))   # classed and function elements inside a list
View(iris)                    # table: untouched
View(1:3)                     # other objects: untouched
View(list(a = 1, b = "x"))    # plain list: still the JSON viewer
kinds <- vapply(calls, function(z) z[[1L]], "")
titles <- vapply(calls, function(z) paste(z[[2L]], collapse = ""), "")
cat("KINDS:", kinds, "\\n")
cat("TITLES:", titles, "\\n")
cat("WRAPPED_ONCE:", !isTRUE(attr(get("View", envir = ns), "rcp_fallback")) == FALSE, "\\n")
`;
const out = spawnSync('Rscript', ['--vanilla', '-e', script], { encoding: 'utf8' });
assert.equal(out.status, 0, out.stderr);
assert.match(out.stdout, /BEFORE: unpatched fails/);
assert.match(out.stdout, /KINDS: list list table text list/);
assert.match(out.stdout, /TITLES: aa list\(h = aa, f = function\(x\) x \+ 1, n = 3\) iris 1:3 list\(a = 1, b = "x"\)/);
assert.match(out.stdout, /WRAPPED_ONCE: TRUE/);
console.log('View shows classed lists as lists and leaves the rest alone.');
