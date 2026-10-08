# Builds a tiny CRAN-like repository so the package installer can be tested offline:
#   <dir>/repo        contains rcptest 1.1 and rcptwo 1.0
#   <dir>/lib         a library with rcptest 1.0 already installed (so there is something to update)
#   <dir>/rcptest_1.1.tar.gz   for "install from a local file"
dir <- normalizePath(commandArgs(TRUE)[1], mustWork = FALSE)
dir.create(dir, showWarnings = FALSE, recursive = TRUE)
r <- file.path(R.home("bin"), "R")
make_pkg <- function(name, version) {
  holder <- file.path(dir, "src", paste0(name, "_", version))
  pkg <- file.path(holder, name)
  dir.create(file.path(pkg, "R"), recursive = TRUE, showWarnings = FALSE)
  writeLines(c(paste("Package:", name), paste("Version:", version), "Title: Test Package", "Description: A tiny package used by the tests.",
               "License: GPL-2", "Author: Test", "Maintainer: Test <test@example.com>"), file.path(pkg, "DESCRIPTION"))
  writeLines("hello <- function() 'hi'", file.path(pkg, "R", "hello.R"))
  writeLines("export(hello)", file.path(pkg, "NAMESPACE"))
  old <- setwd(holder); on.exit(setwd(old))
  system2(r, c("CMD", "build", "--no-build-vignettes", name), stdout = FALSE, stderr = FALSE)
  file.path(holder, paste0(name, "_", version, ".tar.gz"))
}
old <- make_pkg("rcptest", "1.0"); new <- make_pkg("rcptest", "1.1"); two <- make_pkg("rcptwo", "1.0")
contrib <- file.path(dir, "repo", "src", "contrib")
dir.create(contrib, recursive = TRUE, showWarnings = FALSE)
file.copy(c(new, two), contrib, overwrite = TRUE)
tools::write_PACKAGES(contrib, type = "source")
lib <- file.path(dir, "lib"); dir.create(lib, showWarnings = FALSE)
system2(r, c("CMD", "INSTALL", "-l", lib, old), stdout = FALSE, stderr = FALSE)
file.copy(new, file.path(dir, "rcptest_1.1.tar.gz"), overwrite = TRUE)
cat(sort(list.files(dir, recursive = TRUE)), sep = "\n")
