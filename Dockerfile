# ---- Base Stage ----
# Use a specific version of Node.js on Alpine Linux for a small base image
FROM node:18-alpine AS base
WORKDIR /app

# ---- Dependencies Stage ----
# This stage is dedicated to installing dependencies. It will only be re-run
# if your package.json or package-lock.json files change, speeding up builds.
FROM base AS deps
COPY package*.json ./
RUN npm install

# ---- Production Stage ----
# This is the final, optimized image that will be deployed.
FROM base
WORKDIR /app

# Create a dedicated, non-root user for better security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Copy only the necessary package files from the 'deps' stage
COPY --from=deps /app/package*.json ./
# Install ONLY production dependencies to keep the image small
RUN npm ci --omit=dev

# Copy the application source code from the initial context
COPY . .

# Set correct ownership for the application files
RUN chown -R appuser:appgroup /app

# Switch to the non-root user
USER appuser

# Expose the port your application runs on
EXPOSE 3000

# The command to start the application
CMD [ "npm", "start" ]