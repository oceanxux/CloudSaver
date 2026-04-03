#!/bin/sh
set -e

if [ ! -f /app/config/env ]; then
    cp /app/backend/.env.example /app/config/env
    echo "已创建默认配置文件 /app/config/env，请根据需要修改配置"
fi

ln -sf /app/config/env /app/backend/.env

cd /app/backend
nginx
exec npm run start
