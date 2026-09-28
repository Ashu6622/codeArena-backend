# AWS EC2 Deployment Guide

## Overview

This guide explains how to deploy CodeArena (NestJS Backend + Next.js Frontend + Code Runners + PostgreSQL on AWS RDS) onto an AWS EC2 instance.

---

## 1. Required Software on EC2 Instance

Your EC2 instance (Ubuntu 22.04 / 24.04 recommended) needs the following packages installed:

```bash
# Update system packages
sudo apt update && sudo apt upgrade -y

# Install Node.js 20+ / 24
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install Python 3 and C++ compiler for code execution runners
sudo apt install -y python3 g++ build-essential

# Install PM2 process manager & Nginx web server
sudo npm install -g pm2
sudo apt install -y nginx certbot python3-certbot-nginx
```

---

## 2. Environment Configuration Files

### A. Backend `.env` (`codeArena-backend/.env`)

Create `.env` inside `codeArena-backend/`:

```env
PORT=4000
NODE_ENV=production
DATABASE_URL="postgresql://<DB_USER>:<DB_PASSWORD>@prepgo-db.cpmew266uk39.ap-south-1.rds.amazonaws.com:5432/prepgo?schema=public&sslmode=require"

JWT_ACCESS_SECRET="generate-a-random-64-character-secret-key"
JWT_REFRESH_SECRET="generate-a-second-random-64-character-secret-key"

SEED_ADMIN_EMAIL=admin@codearena.com
SEED_ADMIN_PASSWORD=your-private-secure-admin-password
SEED_ADMIN_NAME="CodeArena Admin"

EXECUTION_TIMEOUT_MS=3000
EXECUTION_MEMORY_LIMIT_MB=128
EXECUTION_MAX_OUTPUT_BYTES=65536
```

### B. Frontend `.env.production` (`codeArena-frontend/.env.production`)

Create `.env.production` inside `codeArena-frontend/`:

```env
NEXT_PUBLIC_API_BASE_URL="http://your-ec2-public-ip-or-domain"
```

---

## 3. PM2 Ecosystem Configuration (`ecosystem.config.js`)

Create `ecosystem.config.js` in the project root directory:

```javascript
module.exports = {
  apps: [
    {
      name: 'codearena-backend',
      cwd: './codeArena-backend',
      script: 'dist/apps/api/src/main.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        PORT: 4000,
      },
    },
    {
      name: 'codearena-frontend',
      cwd: './codeArena-frontend',
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3001',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
      },
    },
  ],
};
```

---

## 4. Nginx Reverse Proxy Configuration

Create `/etc/nginx/sites-available/codearena`:

```nginx
server {
    listen 80;
    server_name your-ec2-public-ip-or-domain;

    # Frontend Next.js app
    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # Backend NestJS API routes
    location /auth/ {
        proxy_pass http://127.0.0.1:4000/auth/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /problems/ {
        proxy_pass http://127.0.0.1:4000/problems/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /run {
        proxy_pass http://127.0.0.1:4000/run;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /submissions {
        proxy_pass http://127.0.0.1:4000/submissions;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

Enable site & restart Nginx:

```bash
sudo ln -s /etc/nginx/sites-available/codearena /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

---

## 5. Deployment Step-by-Step Command Execution

```bash
# 1. Clone repository on EC2 instance
git clone <YOUR_GIT_REPO_URL>
cd CodeArena

# 2. Build Backend
cd codeArena-backend
npm install
npm run db:generate
npm run db:deploy
npm run db:seed
npm run build
cd ..

# 3. Build Frontend
cd codeArena-frontend
npm install
npm run build
cd ..

# 4. Start both apps with PM2
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

---

## 6. Verification & Monitoring

- Check PM2 status:
  ```bash
  pm2 status
  pm2 logs
  ```
- Verify runners on EC2:
  ```bash
  which node python3 g++
  ```
- Test health check:
  ```bash
  curl http://localhost:4000/health
  ```
