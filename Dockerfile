# ============================================================
# CREDITCHAIN — Backend NestJS · Imagen Docker
# Alternativa al blueprint nativo de Render (render.yaml).
# Uso local:  docker build -t creditchain-backend .
# ============================================================

# ---------- Etapa 1: build (compile TypeScript) ----------
FROM node:22-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY nest-cli.json tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

# ---------- Etapa 2: producción (solo runtime) ----------
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist

EXPOSE 3001
USER node
CMD ["node", "dist/main.js"]