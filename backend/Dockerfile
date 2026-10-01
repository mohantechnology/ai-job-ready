FROM node:22-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:22-slim AS development

WORKDIR /app

COPY --from=build /app /app

ENV PORT=6102
EXPOSE 6102

CMD ["npm", "run", "dev"]

FROM node:22-slim AS production

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist
COPY public ./public

ENV PORT=6102
EXPOSE 6102

CMD ["node", "dist/main.js"]
