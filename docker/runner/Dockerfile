# Deterministic pre-baked runner image (pinned toolchain + SecLists + wrappers)
FROM debian:stable-slim

ENV DEBIAN_FRONTEND=noninteractive \
    PATH="/usr/local/bin:${PATH}" \
    KR_VERSION=1.0.2

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl ca-certificates bash python3 python3-pip python3-venv jq yq xmlstarlet nmap openssl git bsdextrautils procps net-tools dnsutils bind9-dnsutils \
  && rm -rf /var/lib/apt/lists/*

# Install kiterunner
RUN curl -L "https://github.com/assetnote/kiterunner/releases/download/v${KR_VERSION}/kiterunner_${KR_VERSION}_linux_amd64.tar.gz" \
  | tar xz -C /usr/local/bin

# Python tools in isolated venv (avoids PEP 668 restrictions)
RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:${PATH}"
# arjun + xmltodict from PyPI; jwt_tool is not a PyPI package (we will use Docker image externally)
RUN /opt/venv/bin/pip install --no-cache-dir arjun==2.2.7 xmltodict==0.13.0

# SecLists (copied from repo root context)
ADD seclists /seclists

# Wrappers
ADD backend/wrappers /usr/local/bin/
RUN chmod +x /usr/local/bin/*

# testssl.sh (installed from upstream repo)
RUN git clone --depth 1 https://github.com/drwetter/testssl.sh.git /opt/testssl \
  && ln -sf /opt/testssl/testssl.sh /usr/local/bin/testssl.sh

WORKDIR /work
ENTRYPOINT ["bash"]

