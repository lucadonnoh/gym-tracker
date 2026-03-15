FROM node:20-alpine

WORKDIR /app

# Install build dependencies for better-sqlite3
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build frontend (clean assets first to avoid stale bundles)
RUN rm -rf public/assets public/index.html && npm run build

# Expose port
EXPOSE 3000

# Start the server
CMD ["npm", "start"]
