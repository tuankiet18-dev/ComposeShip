.PHONY: validate pull-base-images generate-execution-secrets render-multinode-env smoke-compose-multinode fixture-config

validate:
	dotnet build backend/OneClickHost.Api/OneClickHost.Api.csproj
	python -m pytest worker/tests
	cd frontend && npm run lint
	cd frontend && npm run build
	docker compose config -q
	docker compose -f docker-compose.execution.yml config -q

pull-base-images:
	docker pull mcr.microsoft.com/dotnet/sdk:10.0
	docker pull mcr.microsoft.com/dotnet/aspnet:10.0
	docker pull python:3.12-slim
	docker pull node:20-alpine
	docker pull nginx:1.27-alpine
	docker pull postgres:16-alpine
	docker pull traefik:v3.4

fixture-config:
	cd fixtures/oneclick-compose-fixture && docker compose config -q

generate-execution-secrets:
	./scripts/generate-execution-secrets.sh

render-multinode-env:
	./scripts/render-multinode-env.sh

smoke-compose-multinode:
	./scripts/smoke-compose-multinode.sh
