FROM node:22-alpine AS base

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

FROM base AS development
ENV PORT=6101
ENV API_PROXY_TARGET=http://backend:6102
EXPOSE 6101
CMD ["sh", "-c", "npm run dev -- --host 0.0.0.0 --port ${PORT}"]

FROM base AS production
ARG VITE_API_URL=/api
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build
ENV PORT=6101
ENV API_PROXY_TARGET=http://backend:6102
EXPOSE 6101
CMD ["sh", "-c", "npm run preview -- --host 0.0.0.0 --port ${PORT}"]
