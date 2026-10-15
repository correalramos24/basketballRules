# syntax=docker/dockerfile:1

# --- Build stage: compile the Astro static site -----------------------------
FROM node:22-alpine AS build

WORKDIR /app

# Install dependencies first (better layer caching)
COPY package.json package-lock.json ./
RUN npm ci

# Copy the sources and build
COPY . .
RUN npm run build

# --- Runtime stage: serve the static output with nginx ----------------------
FROM nginx:alpine AS runtime

# Drop the default site and use ours (listens on 8080)
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf

# Static output produced by the build stage
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
