# Dockerfile for building both x64 and arm64 on an old distro for maximum compatibility.

FROM debian:bullseye-20240513
ENV DEBIAN_FRONTEND=noninteractive

RUN printf 'deb http://archive.debian.org/debian bullseye main\n' > /etc/apt/sources.list \
 && printf 'Acquire::Check-Valid-Until "false";\n' > /etc/apt/apt.conf.d/99no-check-valid-until

RUN dpkg --add-architecture arm64

RUN apt-get update && apt-get install -y \
    build-essential python3 curl pkg-config \
    g++-aarch64-linux-gnu libglib2.0-dev:amd64 libglib2.0-dev:arm64 \
    ca-certificates \
 && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
 && apt-get update && apt-get install -y nodejs \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /src
