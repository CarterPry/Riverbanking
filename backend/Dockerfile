FROM node:18-alpine

WORKDIR /app

# Install tsx globally first
RUN npm install -g tsx

# Copy everything
COPY . .

# Debug: Check what's here before npm install
RUN ls -la

# Install dependencies AFTER copying to ensure they exist
RUN npm install && ls -la node_modules | head -10

# Set NODE_PATH to help with module resolution
ENV NODE_PATH=/app/node_modules

# Expose port
EXPOSE 3000

# Start the application using tsx directly
CMD ["tsx", "watch", "src/index.ts"] 