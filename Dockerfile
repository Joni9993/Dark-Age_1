FROM node:20-alpine
WORKDIR /app
COPY . .
WORKDIR /app/server
RUN npm ci --omit=dev
EXPOSE 3000
CMD ["node", "index.js"]
