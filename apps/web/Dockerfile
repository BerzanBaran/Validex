FROM node:24-alpine

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci \
    && npm install --no-save --no-package-lock @next/swc-linux-x64-musl@16.3.6
COPY . .

EXPOSE 3000
CMD ["npm", "run", "dev"]
