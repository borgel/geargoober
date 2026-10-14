FROM node:22-alpine
RUN apk add --no-cache bash python3 py3-pip \
 && pip install --no-cache-dir --break-system-packages ezdxf
WORKDIR /app
