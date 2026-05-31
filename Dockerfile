FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY server.js ai.js ./
COPY public ./public

ENV PORT=10000
EXPOSE 10000

CMD ["node", "server.js"]
