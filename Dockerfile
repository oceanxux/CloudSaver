FROM node:18-alpine AS frontend-build
WORKDIR /build/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM node:18-alpine AS backend-build
WORKDIR /build/backend
COPY backend/package*.json ./
RUN npm ci
COPY backend/ ./
RUN npm run build

FROM node:18-alpine

RUN apk add --no-cache nginx

WORKDIR /app

RUN mkdir -p /app/config /app/backend /usr/share/nginx/html

COPY --from=frontend-build /build/frontend/dist /usr/share/nginx/html
COPY --from=backend-build /build/backend/dist /app/backend/dist
COPY --from=backend-build /build/backend/package*.json /app/backend/
COPY --from=backend-build /build/backend/.env.example /app/backend/.env.example
COPY nginx.conf /etc/nginx/nginx.conf
COPY docker-entrypoint.sh /app/docker-entrypoint.sh

RUN chmod +x /app/docker-entrypoint.sh \
  && npm --prefix /app/backend ci --omit=dev

VOLUME ["/app/config"]

EXPOSE 8008

ENTRYPOINT ["/app/docker-entrypoint.sh"]
