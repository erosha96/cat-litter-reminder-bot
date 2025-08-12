FROM node:20-alpine

WORKDIR /app

# Копируем package.json и lock в контейнер и ставим зависимости (node_modules появятся в /app)
COPY package*.json ./
RUN npm install

# Копируем исходный код (в /app/src)
COPY src ./src

# На всякий случай создаём папку data внутри контейнера
RUN mkdir -p /app/data

VOLUME ["/app/data"]

# Запускаем бот
CMD ["node", "src/app.js"]
