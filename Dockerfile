# ---- Build stage ----
FROM node:20-bookworm-slim AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

ARG APP_NAME
RUN npx nx run ${APP_NAME}:build

# ---- Runtime stage ----
FROM node:20-bookworm-slim
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

ARG APP_NAME
ENV APP_NAME=${APP_NAME}

COPY --from=builder /app/apps/${APP_NAME}/dist ./apps/${APP_NAME}/dist

CMD ["sh", "-c", "node apps/${APP_NAME}/dist/main.js"]
