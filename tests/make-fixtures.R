# Writes real data files for the import commands into the directory given as argument:
# built from example data shipped with haven, foreign and readxl, so nothing binary is committed.
dir <- commandArgs(TRUE)[1]
dir.create(dir, showWarnings = FALSE, recursive = TRUE)
ex <- system.file("examples", package = "haven")
file.copy(file.path(ex, c("iris.sav", "iris.dta", "iris.sas7bdat")), dir, overwrite = TRUE)
file.copy(readxl::readxl_example("datasets.xlsx"), file.path(dir, "datasets.xlsx"), overwrite = TRUE)
small <- data.frame(id = 1:6, grupo = rep(c("a", "b"), 3), valor = c(1.5, 2.5, 3.5, 4.5, 5.5, 6.5))
haven::write_xpt(small, file.path(dir, "small.xpt"), version = 5)   # foreign can read it
haven::write_xpt(small, file.path(dir, "small8.xpt"), version = 8) # only haven can
file.copy(file.path(system.file("files", package = "foreign"), "electric.sav"), dir, overwrite = TRUE) # foreign can read it
foreign::write.dta(small, file.path(dir, "small.dta"))               # foreign can read it
write.csv(small, file.path(dir, "small.csv"), row.names = FALSE)
write.table(small, file.path(dir, "small.tsv"), sep = "\t", row.names = FALSE)
saveRDS(small, file.path(dir, "small.rds"))
# an R workspace with two data frames and something that is not a data set
frame_one <- small; frame_two <- data.frame(x = 1:3, y = c("p", "q", "r")); not_a_frame <- list(1, 2)
save(frame_one, frame_two, not_a_frame, file = file.path(dir, "two-frames.RData"))
cat(sort(list.files(dir)), sep = "\n")
