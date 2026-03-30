FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

RUN mkdir -p /data/uploads

EXPOSE 3001

ENV NODE_ENV=production
ENV DATA_DIR=/data

CMD ["node", "server.js"]
