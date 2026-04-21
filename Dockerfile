FROM node:22-alpine

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

RUN npm install

# Install serve globally
RUN npm i -g serve

# Copy source
COPY . .

# Build Vite project
RUN npm run build

EXPOSE 3000

CMD ["serve", "-s", "dist", "-l", "3000"]
