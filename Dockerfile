FROM node:22-alpine

WORKDIR /app

# Install build tools
RUN apk add --no-cache python3 make g++ bash

# Copy package.json first
COPY package.json package-lock.json ./

RUN npm install

# Install serve globally
RUN npm i -g serve

# Copy source
COPY . .

# Build Vite project
RUN npm run build

# Runtime config substitution entrypoint
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 3000

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
