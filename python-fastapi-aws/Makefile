# Used by `sam build` (BuildMethod: makefile). Builds the Lambda package into $(ARTIFACTS_DIR).
# Wheels are downloaded for Lambda's arm64 Linux, not for the machine running the build.

build-ApiFunction:
	pip install --requirement requirements.txt --target "$(ARTIFACTS_DIR)" \
		--platform manylinux2014_aarch64 --implementation cp --python-version 3.13 \
		--only-binary=:all: --no-compile
	cp -r app "$(ARTIFACTS_DIR)/app"
