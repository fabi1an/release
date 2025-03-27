FROM gitpod/workspace-full-vnc:latest

USER root

RUN apt-get update \
    # window manager
    && apt-get install -y jwm \
    # electron
    && apt-get install -y build-essential clang \
    libdbus-1-dev libgtk-3-dev \
    libnotify-dev libasound2-dev libcap-dev \
    libcups2-dev libxtst-dev \
    libxss1 libnss3-dev gcc-multilib g++-multilib curl \
    gperf bison python3-dbusmock openjdk-8-jre \
    # native-keymap
    && apt-get install -y libx11-dev libxkbfile-dev \
    && apt-get clean && rm -rf /var/cache/apt/* && rm -rf /var/lib/apt/lists/* && rm -rf /tmp/*

USER gitpod

ENV ELECTRON_BUILDER_CACHE=/home/gitpod/.cache/electron-builder \
    ELECTRON_CACHE=/home/gitpod/.cache/electron \
    ELECTRON_SKIP_BINARY_DOWNLOAD=1

RUN bash -c "\
    source /home/gitpod/.nvm/nvm.sh && \
    nvm install --lts && \
    nvm use --lts && \
    npm install -g pnpm && \
    nvm cache clear"

USER root
