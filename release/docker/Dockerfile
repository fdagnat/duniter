# ------------------------------------------------------------------------------
# Build Stage
# ------------------------------------------------------------------------------

FROM node:10-alpine as build

LABEL maintainer="elois <elois@duniter.org>"
LABEL version="0.1.0"
LABEL description="Duniter server (Crypto-currency software to manage libre currency such as Ğ1)"

ARG DUNITER_UI_VER="1.7.x"

RUN apk update && \
	apk add ca-certificates curl && \
	update-ca-certificates && \
	apk add --update python make g++

WORKDIR /duniter

# copy source tree
COPY ./ ./

# install latest stable rust
RUN curl https://sh.rustup.rs -sSf | sh -s -- -y

# build duniter
RUN PATH=${HOME}/.cargo/bin:${PATH} \
	RUSTFLAGS="-C target-feature=-crt-static" \
	make -C release ADD_DEBUG=N server-gui clean \
	&& cp release/docker/duniter.sh work/docker.sh \
	&& rm -rf work/extra

# ------------------------------------------------------------------------------
# Final Stage
# ------------------------------------------------------------------------------

FROM node:10-alpine

# create group and user duniter
RUN addgroup -S -g 1111 duniter && \
	adduser -SD -h /duniter -G duniter -u 1111 duniter
RUN mkdir -p /var/lib/duniter /etc/duniter && chown duniter:duniter /var/lib/duniter /etc/duniter

# copy the build artifact from the build stage
COPY --from=build --chown=duniter:duniter /duniter/work /duniter/duniter

# copy bootstrap script
RUN cp /duniter/duniter/docker.sh /usr/bin/duniter && \
   chmod +x /usr/bin/duniter && \
   chown duniter:duniter /usr/bin/duniter

# create volumes
VOLUME /var/lib/duniter
VOLUME /etc/duniter

# expose ports
EXPOSE 9220 10901 20901

# use duniter user
USER duniter
WORKDIR /duniter

ENTRYPOINT ["/usr/bin/duniter"]
CMD []
