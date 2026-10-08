.PHONY: generate test package install

generate:  ## regenerate package.json, translations and data/ from the catalog and Rcmdr's menus
	node build/generate.js

test:  ## unit tests, then every command run in real R (needs Rscript with Rcmdr and its dependencies)
	node tests/formmodel.js
	node tests/hover.js
	node tests/view.js
	node tests/options.js
	node tests/rcmdr.js
	node tests/extension.js
	Rscript tests/runner.R
	node tests/catalog.js

package:  ## build dist/r-commander-play-<version>.vsix
	build/package.sh

install: package  ## install it in VS Code
	code --install-extension dist/r-commander-play-*.vsix --force
