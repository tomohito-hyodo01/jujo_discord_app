FROM node:20-slim AS build

WORKDIR /app

# 依存パッケージをインストール
COPY package.json package-lock.json ./
RUN npm ci

# アプリケーションコードをコピー
COPY . .

# ビルド時の環境変数
ARG VITE_API_URL
ARG VITE_DISCORD_CLIENT_ID

ENV VITE_API_URL=$VITE_API_URL
ENV VITE_DISCORD_CLIENT_ID=$VITE_DISCORD_CLIENT_ID

# ビルド
RUN npm run build

# 本番環境
FROM nginx:alpine

# Nginxの設定
COPY <<EOF /etc/nginx/conf.d/default.conf
server {
    listen 80;
    server_name _;
    
    root /usr/share/nginx/html;
    index index.html;
    
    location / {
        try_files \$uri \$uri/ /index.html;
    }
}
EOF

# ビルドファイルをコピー
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

