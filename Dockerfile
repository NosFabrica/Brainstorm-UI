# Keep in sync with .nvmrc (checked in CI).
FROM node:24-alpine AS builder

WORKDIR /app

# Install build tools
RUN apk add --no-cache python3 make g++ bash

# Copy package.json first
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# Copy source
COPY . .

# This build's id (BUILD_ID in vite.config.ts), which the page and its service
# worker compare to tell a new deploy: the commit CI passes in (build.yml).
# Without one, vite falls back to the time of the build.
ARG GIT_SHA=""
ENV BUILD_ID=$GIT_SHA

# Build Vite project
RUN npm run build

# A .gz beside each hashed JS, CSS, SVG and wasm file, at the best level, for
# nginx's gzip_static (nginx.conf, /assets/ only): compressed once here rather
# than on every request at the level a request can afford. Only where it is
# smaller. Not the HTML or config.js: the entrypoint rewrites those at start.
RUN node -e " \
  const fs = require('fs'), path = require('path'), zlib = require('zlib'); \
  for (const name of fs.readdirSync('dist/assets', { recursive: true })) { \
    if (!/\.(js|css|svg|wasm)$/.test(name)) continue; \
    const file = path.join('dist/assets', name), raw = fs.readFileSync(file); \
    const gz = zlib.gzipSync(raw, { level: 9 }); \
    if (gz.length < raw.length) fs.writeFileSync(file + '.gz', gz); \
  }"

# Every file's mtime from its own content. nginx's ETag and Last-Modified come
# from the mtime (and size), and a build stamps every file with the time it ran,
# so each deploy made every unhashed file in public/ look changed: a browser
# revalidating an icon got the whole icon again rather than a 304. A fixed
# timestamp would cure that but would also answer 304 for an edit that kept the
# size (an SVG's colour, say); a time drawn from the content's hash changes
# exactly when the content does. Somewhere in 2000-2008, so never in the future.
RUN node -e " \
  const fs = require('fs'), path = require('path'), crypto = require('crypto'); \
  for (const name of fs.readdirSync('dist', { recursive: true })) { \
    const file = path.join('dist', name); \
    if (!fs.statSync(file).isFile()) continue; \
    const hash = crypto.createHash('sha256').update(fs.readFileSync(file)).digest(); \
    const time = 946684800 + (hash.readUInt32BE(0) % 268435456); \
    fs.utimesSync(file, time, time); \
  }"

FROM nginx:1.31-alpine AS runtime

# A template, not the final config: the entrypoint substitutes ${OG_RESOLVER}
# from /etc/resolv.conf so the same file works under compose and k8s.
COPY nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=builder /app/dist /usr/share/nginx/html

# Runtime config substitution entrypoint
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 3000

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
