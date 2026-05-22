FROM node:22-alpine AS builder

WORKDIR /app

# Install build tools
RUN apk add --no-cache python3 make g++ bash

# VITE env vars

ARG VITE_API_URL
ARG VITE_NIP85_RELAY_URL

ENV VITE_API_URL=$VITE_API_URL
ENV VITE_NIP85_RELAY_URL=$VITE_NIP85_RELAY_URL

# Copy package.json first
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# Copy source
COPY . .

# Build Vite project
RUN npm run build

FROM nginx:1.31-alpine AS runtime

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 3000

CMD ["nginx", "-g", "daemon off;"]
