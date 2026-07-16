.PHONY: up down logs test

up:
	docker compose up -d --build

down:
	docker compose down -v

logs:
	docker compose logs -f

test:
	docker compose exec -T api python -c "import urllib.request; print(urllib.request.urlopen('http://localhost:8000/health').read().decode())"
	docker compose exec -T api python -c "import urllib.request; print(urllib.request.urlopen('http://localhost:8000/db-check').read().decode())"
