# docker/kali-toolset/Dockerfile
FROM kalilinux/kali-rolling

# Update and install essential security testing tools
RUN apt-get update && apt-get install -y \
    nmap \
    nikto \
    zaproxy \
    sqlmap \
    python3-selenium \
    python3-pip \
    chromium \
    chromium-driver \
    curl \
    wget \
    git \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Install additional Python tools
RUN pip3 install --no-cache-dir \
    requests \
    beautifulsoup4 \
    selenium \
    python-owasp-zap-v2.4

# Create working directory
WORKDIR /app

# Create results directory
RUN mkdir -p /tmp/results

# Set up Chrome for headless operation
ENV CHROME_BIN=/usr/bin/chromium
ENV CHROME_PATH=/usr/lib/chromium/

# Copy any custom scripts (if needed)
# COPY scripts/ /app/scripts/

# Default command
CMD ["bash"]