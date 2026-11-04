# HospAI web: builds the HMS app and the embedded Keppler OCR app, then serves
# both from nginx together with the reverse proxy the browser relies on (the
# same routes vite.config.ts's dev proxy provides in development).

# ── 1. HMS app ──────────────────────────────────────────────────────────────
FROM node:22-alpine AS hms
WORKDIR /app
COPY package.json package-lock.json ./
# --legacy-peer-deps: the dependency tree has a known, harmless peer-range
# conflict (Vite 8 vs @vitejs/plugin-react 4); plain `npm ci` refuses it.
RUN npm ci --legacy-peer-deps --no-audit --no-fund
COPY index.html tsconfig.json vite.config.ts ./
COPY public ./public
COPY src ./src
# vite.config.ts imports the dev-only mock store from here.
COPY server/db/memoryStore.mjs ./server/db/memoryStore.mjs
ARG VITE_PUBLIC_APP_URL=""
ARG VITE_RAZORPAY_KEY_ID=""
# VITE_API_BASE is deliberately empty: the app calls its own origin
# (/hms-api), which nginx below forwards to the gateway.
ENV VITE_API_BASE="" \
    VITE_PUBLIC_APP_URL=$VITE_PUBLIC_APP_URL \
    VITE_RAZORPAY_KEY_ID=$VITE_RAZORPAY_KEY_ID
RUN npx vite build --outDir /out/hms

# ── 2. Keppler OCR app (served under /keppler-ocr/) ─────────────────────────
# Same layout as development: the OCR app sits inside the HMS folder, because
# it declares React only as a peer and resolves the packages it does not
# install itself (react, react-dom) from the HMS app's node_modules one level
# up. Reproducing that keeps production identical to what was tested.
FROM node:22-alpine AS ocr
WORKDIR /build/dpi-ocr-frontend
COPY --from=hms /app/node_modules /build/node_modules
COPY dpi-ocr-frontend/package.json dpi-ocr-frontend/package-lock.json ./
# React-19 peer ranges in some UI kits: same flag as the HMS app.
RUN npm ci --legacy-peer-deps --no-audit --no-fund
COPY dpi-ocr-frontend/ ./
RUN npx vite build --outDir /out/ocr

# ── 3. nginx ────────────────────────────────────────────────────────────────
FROM nginx:1.27-alpine
COPY --from=hms /out/hms /usr/share/nginx/html
COPY --from=ocr /out/ocr /usr/share/nginx/keppler-ocr
# Rendered at start-up by the nginx image's envsubst step (AI_SERVER_URL).
COPY deploy/web/default.conf.template /etc/nginx/templates/default.conf.template
COPY deploy/web/proxy_headers.inc /etc/nginx/conf.d/proxy_headers.inc
ENV NGINX_ENVSUBST_FILTER="^AI_SERVER_URL$"
EXPOSE 80
