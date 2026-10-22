.PHONY: install dev backend frontend test build serve

install:
	cd backend && python3 -m venv .venv && .venv/bin/pip install -q -r requirements.txt
	cd frontend && pnpm install
	@test -f backend/.env || cp backend/.env.example backend/.env

backend:
	cd backend && .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload

frontend:
	cd frontend && pnpm dev --host 127.0.0.1 --port 5173

dev:
	$(MAKE) -j2 backend frontend

test:
	cd backend && .venv/bin/python -m pytest -q
	cd frontend && pnpm exec tsc -b

build:
	cd frontend && pnpm build

serve: build
	cd backend && .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000 --no-access-log
