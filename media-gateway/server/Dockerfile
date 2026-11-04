# Build context: media-gateway/
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci --workspace server --include-workspace-root
COPY server/ server/
RUN npm run build --workspace server

FROM node:22-alpine
RUN apk add --no-cache ffmpeg
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci --workspace server --omit=dev && npm cache clean --force
COPY --from=build /app/server/dist server/dist
USER node
EXPOSE 3000 3001
CMD ["node", "server/dist/main.js"]
