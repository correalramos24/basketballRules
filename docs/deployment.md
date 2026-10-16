# Deployment

The site is built in a multi-stage Docker image and served as static files by nginx on
port **8080** (the port the existing deployment uses).

## Build and run

```bash
# With Docker Compose
docker compose up --build

# or with plain Docker
docker build -t basketballrules:latest .
docker run --rm -p 8080:8080 basketballrules:latest
```

Then open **http://localhost:8080**.

## What's in the image

- **`Dockerfile`** — multi-stage:
  1. `node:22-alpine` runs `npm ci && npm run build`.
  2. `nginx:alpine` receives the built `dist/` and our `docker/nginx.conf`.
  The runtime stage exposes **8080** and defines a `HEALTHCHECK` against `/`.
- **`docker/nginx.conf`** — listens on `8080`, serves directory-style URLs, gzip-compresses
  text responses, and sets long-lived `immutable` caching for content-hashed `/_astro/`
  assets.
- **`docker-compose.yml`** — builds the image and maps host `8080` → container `8080`.
- **`.dockerignore`** — keeps `node_modules/`, `dist/`, `.git/`, `docs/` and TLS material
  out of the build context.

## Networking / TLS

The container speaks plain HTTP on **8080** and exposes **8080** externally, so it can sit
behind a TLS-terminating reverse proxy as-is. If your proxy expects the container to listen
on another port, change the `listen` directive in `docker/nginx.conf`, the `EXPOSE` in the
`Dockerfile`, and the mapping in `docker-compose.yml` together.
