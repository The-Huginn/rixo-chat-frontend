# Use Python Alpine image for smaller size
FROM python:3.11-alpine

# Cache busting - forces rebuild when changed
ARG CACHEBUST=1

# Set working directory
WORKDIR /app
RUN echo "Build date: $(date)" > /app/build-info.txt

# Copy all static files
COPY . .

# Expose port 3000
EXPOSE 3000

# Start the Python HTTP server
CMD ["python", "server.py"]