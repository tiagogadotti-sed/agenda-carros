# syntax=docker/dockerfile:1
ARG NODE_VERSION=24.21.0
FROM node:${NODE_VERSION}-slim AS base
WORKDIR /app
ENV NODE_ENV=production

FROM base AS build
COPY package-lock.json package.json ./
RUN npm ci --include=dev
COPY . .
RUN npm run build
RUN npm prune --omit=dev

FROM base
RUN apt-get update \
    && apt-get install --no-install-recommends -y sqlite3 \
    && rm -rf /var/lib/apt/lists/* \
    && sqlite3 --version
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY --from=build /app/shared ./shared
RUN mkdir -p /data
EXPOSE 3000
# Node receives shutdown signals directly. tsx is a production dependency.
CMD ["node", "--import", "tsx", "server/index.ts"]
