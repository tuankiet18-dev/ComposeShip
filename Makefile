PYTHON ?= python3

.PHONY: validate pull-base-images generate-execution-secrets render-multinode-env smoke-compose-multinode fixture-config terraform-validate

validate:
	dotnet build backend/OneClickHost.Api/OneClickHost.Api.csproj
	$(PYTHON) -m pytest worker/tests
	cd frontend && npm run lint
	cd frontend && npm run build
	docker compose config -q
	docker compose -f docker-compose.execution.yml config -q
	docker compose -f docker-compose.control-plane.yml config -q

pull-base-images:
	docker pull mcr.microsoft.com/dotnet/sdk:10.0@sha256:ea8bde36c11b6e7eec2656d0e59101d4462f6bd630730f2c8201ed0572b295d5
	docker pull mcr.microsoft.com/dotnet/aspnet:10.0@sha256:7644f992230d35cf230017189d4038c0ae0f7388b13f4f7ae1900a155bafb597
	docker pull python:3.12.13-slim
	docker pull node:20.19.6-alpine
	docker pull nginx:1.27.5-alpine
	docker pull postgres:16-alpine@sha256:57c72fd2a128e416c7fcc499958864df5301e940bca0a56f58fddf30ffc07777
	docker pull traefik:v3.4@sha256:06ddf61ee653caf4f4211a604e657f084f4727f762c16f826c97aafbefcb279e

fixture-config:
	cd fixtures/oneclick-compose-fixture && docker compose config -q

generate-execution-secrets:
	./scripts/generate-execution-secrets.sh

render-multinode-env:
	./scripts/render-multinode-env.sh

smoke-compose-multinode:
	./scripts/smoke-compose-multinode.sh

terraform-validate:
	cd infra/aws/mvp && terraform init -backend=false && terraform fmt -check && terraform validate
