# Node HRMS server (frontend/server/app.mjs): the legacy HR API (/api/hr/*) and the
# eSSL biometric push endpoint (/iclock). Needs only express, cors and pg.
FROM node:22-alpine
WORKDIR /app
RUN npm init -y >/dev/null \
 && npm install --no-audit --no-fund express@5.3.0 cors@2.8.6 pg@8.23.1 \
 && npm pkg set type=module
COPY frontend/server ./server
USER node
EXPOSE 8011
CMD ["node", "server/app.mjs"]
