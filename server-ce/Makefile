# Makefile

SHARELATEX_BASE_TAG ?= sharelatex/sharelatex-base
SHARELATEX_TAG ?= sharelatex/sharelatex
SHARELATEX_BASE_CACHE := $(shell echo $(SHARELATEX_BASE_TAG) | sed -E 's/(.+):.+/\1:latest/')
MONOREPO_REVISION := $(shell git rev-parse HEAD)
MONOREPO_ROOT := ../

all: build-base build-community

build-base:
	echo "build base ${aliyun_tag} with $(DOCKER_CONFIG)"
	cp .dockerignore $(MONOREPO_ROOT)
	docker pull $(SHARELATEX_BASE_CACHE) || echo "nothing cached yet"
	docker build -f Dockerfile-base --pull \
		--cache-from $(SHARELATEX_BASE_CACHE) \
		-t $(SHARELATEX_BASE_TAG) \
		$(MONOREPO_ROOT)


build-community:
	echo "build community ${aliyun_tag} with $(DOCKER_CONFIG)"
	cp .dockerignore $(MONOREPO_ROOT)
	docker build --build-arg SHARELATEX_BASE_TAG --build-arg MONOREPO_REVISION \
		-f Dockerfile \
		-t $(SHARELATEX_TAG) \
		$(MONOREPO_ROOT)

.PHONY: all build-base build-community
