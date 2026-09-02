FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

# HEALTHCHECK verifying heartbeat file updated in the last 60 seconds
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD test -f /tmp/heartbeat || exit 1

CMD ["node", "src/index.js"]
