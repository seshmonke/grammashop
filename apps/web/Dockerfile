# syntax=docker/dockerfile:1
FROM node:22-alpine AS build
WORKDIR /app
COPY apps/web/public ./public

FROM nginx:1.27-alpine AS runtime
COPY --from=build /app/public /usr/share/nginx/html
EXPOSE 80
