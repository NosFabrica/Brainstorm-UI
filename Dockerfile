FROM node:22-alpine AS builder

WORKDIR /app

# Install build tools
RUN apk add --no-cache python3 make g++ bash

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

# Runtime config substitution entrypoint
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 3000

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
