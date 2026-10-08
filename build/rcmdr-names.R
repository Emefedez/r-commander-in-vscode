# Writes data/rcmdr-names.txt: every name the R Commander functions would put on the search path
# (exports of Rcmdr, its plug-ins and the packages they depend on). The runner uses it to attach
# them only when the code run actually mentions one.
source("runner.R")
exports <- character()
add <- function(pkg) if (requireNamespace(pkg, quietly = TRUE)) exports <<- c(exports, getNamespaceExports(pkg))
plugins <- grep("^RcmdrPlugin\\.", .packages(all.available = TRUE), value = TRUE)
depends <- function(pkg) {
  field <- utils::packageDescription(pkg)$Depends
  if (is.null(field)) return(character())
  setdiff(trimws(sub("\\(.*$", "", strsplit(field, ",")[[1L]])), c("R", "base", "stats", "graphics", "grDevices", "utils", "datasets", "methods"))
}
for (pkg in unique(c("Rcmdr", plugins, unlist(lapply(c("Rcmdr", plugins), depends))))) add(pkg)
exports <- setdiff(unique(exports), c(ls(baseenv()), unlist(lapply(c("stats", "graphics", "grDevices", "utils", "datasets", "methods"), getNamespaceExports))))
exports <- exports[grepl("^[A-Za-z.][A-Za-z0-9._]*$", exports)]
writeLines(sort(exports), "data/rcmdr-names.txt")
cat(length(exports), "names\n")
