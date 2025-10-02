FROM node:22-alpine

# Install curl for healthcheck
RUN apk add --no-cache curl

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies with retry logic for network issues
RUN npm config set fetch-retries 5 && \
    npm config set fetch-retry-mintimeout 20000 && \
    npm config set fetch-retry-maxtimeout 120000 && \
    npm install --production --prefer-offline --no-audit --progress=false || \
    (npm cache clean --force && npm install --production --no-audit --progress=false)

# Copy application files
COPY server.js ./

# Create data directory
RUN mkdir -p /app/data

# Expose ports
EXPOSE 4001 9091

# Run the service
CMD ["node", "server.js"]