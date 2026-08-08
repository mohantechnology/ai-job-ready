FROM node:22-alpine AS base

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

FROM base AS development
ENV API_PROXY_TARGET=http://backend:6102
EXPOSE 6101
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "6101"]

FROM base AS production
RUN npm run build
ENV API_PROXY_TARGET=http://backend:6102
EXPOSE 6101
CMD ["npm", "run", "preview", "--", "--host", "0.0.0.0", "--port", "6101"]
