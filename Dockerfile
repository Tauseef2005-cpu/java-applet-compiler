# Use Eclipse Temurin JDK 8 as the base image (ensures native JDK 8 is available)
FROM eclipse-temurin:8-jdk

# Copy Node.js from official Node image (more robust than deprecated nodesource scripts)
COPY --from=node:20 /usr/local /usr/local

# Create application directory
WORKDIR /app

# Copy package.json files first to leverage Docker layer caching
COPY backend/package*.json ./backend/
COPY frontend/package*.json ./frontend/

# Install backend dependencies
WORKDIR /app/backend
RUN npm ci

# Install frontend dependencies
WORKDIR /app/frontend
RUN npm ci

# Copy the entire workspace code
COPY . /app

# Build React/Vite frontend static files
WORKDIR /app/frontend
RUN npm run build

# Expose the production port
EXPOSE 3000

# Set environment variables for production
ENV NODE_ENV=production
ENV PORT=3000

# Start Express server from backend directory
WORKDIR /app/backend
CMD ["node", "server.cjs"]
