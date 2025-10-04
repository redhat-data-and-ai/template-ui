.PHONY: dev clean

clean:
	rm -rf node_modules dist

dev:
	@if [ ! -f .env ]; then \
		echo "Creating .env from env.template..."; \
		cp env.template .env; \
	else \
		echo ".env file already exists, skipping copy"; \
	fi
	npm ci
	npm run build
	npm start

local:
	@if [ ! -f .env ]; then \
		echo "Creating .env from env.template..."; \
		cp env.template .env; \
	else \
		echo ".env file already exists, skipping copy"; \
	fi
	npm ci
	npm run dev

	
