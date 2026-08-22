# --- ETAPA DE COMPILACIÓN ---
FROM node:22-slim AS builder

WORKDIR /usr/src/app

# Instalar pnpm globalmente
RUN npm install -g pnpm

# Copiar metadatos de dependencias y esquema prisma para el postinstall
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY tsconfig*.json nest-cli.json ./
COPY prisma ./prisma

# Instalar TODAS las dependencias (ejecuta prisma generate en el postinstall)
RUN pnpm install

# Copiar código fuente
COPY src ./src

# Compilar NestJS
RUN pnpm run build

# --- ETAPA DE PRODUCCIÓN ---
FROM node:22-slim AS runner

WORKDIR /usr/src/app

ENV NODE_ENV=production

# Instalar pnpm globalmente
RUN npm install -g pnpm

# Copiar metadatos y prisma para el postinstall
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY --from=builder /usr/src/app/prisma ./prisma

# Instalar solo dependencias de producción de forma limpia
RUN pnpm install --prod

# Copiar el build compilado
COPY --from=builder /usr/src/app/dist ./dist

# Cloud Run inyecta el puerto 8080 automáticamente
EXPOSE 8080

# Aplica migraciones pendientes antes de iniciar la app
CMD pnpm prisma migrate deploy && node dist/src/main.js