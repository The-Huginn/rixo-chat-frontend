# Use Python Alpine image for smaller size
FROM python:3.11-alpine

# Set working directory
WORKDIR /app

# Copy all static files
COPY . .

# Expose port 3000
EXPOSE 3000

# Start the Python HTTP server
CMD ["python", "server.py"]