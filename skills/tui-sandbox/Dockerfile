# ── TUI Sandbox Base Image ────────────────────────────────────────────────────
FROM ubuntu:24.04

ARG USERNAME=satiani
ARG PASSWORD=Hostile1
ARG DOTFILES_REPO=https://github.com/satiani/init.git

# ── System packages ──────────────────────────────────────────────────────────
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update -qq && apt-get install -y -qq \
        curl wget git build-essential \
        python3 python3-pip python3-venv pipx \
        ncurses-bin libncurses-dev \
        locales ca-certificates \
        tmux htop nano vim \
        sudo zsh rsync cmake \
        pkg-config libssl-dev \
        unzip gnupg pass \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# ── Node.js (latest “current” from NodeSource) ──────────────────────────────
RUN curl -fsSL https://deb.nodesource.com/setup_current.x | bash - \
    && apt-get install -y -qq nodejs \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# ── Locale ───────────────────────────────────────────────────────────────────
RUN locale-gen en_US.UTF-8
ENV LANG=en_US.UTF-8
ENV LC_ALL=en_US.UTF-8
ENV TERM=xterm-256color

# ── User setup ───────────────────────────────────────────────────────────────
RUN useradd -m -s /usr/bin/zsh ${USERNAME} \
    && echo "${USERNAME}:${PASSWORD}" | chpasswd \
    && usermod -aG sudo ${USERNAME} \
    && echo "${USERNAME} ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/${USERNAME}

# ── Dotfiles ─────────────────────────────────────────────────────────────────
USER ${USERNAME}
WORKDIR /home/${USERNAME}

RUN git clone ${DOTFILES_REPO} ~/init

# Run deploy.sh to install all tools (oh-my-zsh, rust, ripgrep, starship, fzf, zoxide, nvim, etc.)
RUN cd ~/init && bash ./deploy.sh

# Non-root global npm installs go to ~/.local (e.g. npm i -g @mariozechner/pi-coding-agent)
RUN npm config set prefix "/home/${USERNAME}/.local"

# ── Runtime defaults ─────────────────────────────────────────────────────────
USER ${USERNAME}
WORKDIR /home/${USERNAME}
CMD ["sleep", "infinity"]
