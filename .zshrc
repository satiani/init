eval "$(starship init zsh)"
export ZSH="$HOME/.oh-my-zsh"
plugins=(git kubectl colored-man-pages command-not-found docker)
source $ZSH/oh-my-zsh.sh

# Personal config

export LANG=en_US.UTF-8
set -o vi
bindkey '^R' history-incremental-search-backward
alias vi='nvim'
alias vim='nvim'

export PATH=~/.local/bin:~/.cargo/bin:$PATH

if [[ $( uname ) == "Darwin" ]]; then
    if ! [[ -d /opt/homebrew/opt/coreutils/libexec/gnubin ]]; then
        echo "Consider brew install coreutils to use GNU utils"
    else
        export PATH=/opt/homebrew/opt/coreutils/libexec/gnubin:$PATH
        alias ls='ls --color=auto'
    fi;
    if type brew &>/dev/null
    then
        FPATH="$(brew --prefix)/share/zsh/site-functions:${FPATH}"
        autoload -Uz compinit
        compinit
    fi
fi;

if command -v pyenv > /dev/null; then
    export PYENV_ROOT="$HOME/.pyenv"
    eval "$(pyenv init -)"
fi;

if command -v jenv > /dev/null; then
  export PATH="$HOME/.jenv/bin:$PATH"
  eval "$(jenv init -)"
fi;
# BEGIN ANSIBLE MANAGED BLOCK
# Load homebrew shell variables
eval "$(/opt/homebrew/bin/brew shellenv)"

# Force certain more-secure behaviours from homebrew
export HOMEBREW_NO_INSECURE_REDIRECT=1
export HOMEBREW_CASK_OPTS=--require-sha
export HOMEBREW_DIR=/opt/homebrew
export HOMEBREW_BIN=/opt/homebrew/bin

# Load python shims
eval "$(pyenv init -)"

# Load ruby shims
eval "$(rbenv init -)"

# Prefer GNU binaries to Macintosh binaries.
export PATH="/opt/homebrew/opt/coreutils/libexec/gnubin:$PATH"

# Add datadog devtools binaries to the PATH
export PATH="$HOME/dd/devtools/bin:$PATH"

# Point GOPATH to our go sources
export GOPATH="$HOME/go"

# Add binaries that are go install-ed to PATH
export PATH="$GOPATH/bin:$PATH"

# Point DATADOG_ROOT to ~/dd symlink
export DATADOG_ROOT="$HOME/dd"

# Tell the devenv vm to mount $GOPATH/src rather than just dd-go
export MOUNT_ALL_GO_SRC=1

# store key in the login keychain instead of aws-vault managing a hidden keychain
export AWS_VAULT_KEYCHAIN_NAME=login

# tweak session times so you don't have to re-enter passwords every 5min
export AWS_SESSION_TTL=24h
export AWS_ASSUME_ROLE_TTL=1h

# Helm switch from storing objects in kubernetes configmaps to
# secrets by default, but we still use the old default.
export HELM_DRIVER=configmap

# Go 1.16+ sets GO111MODULE to off by default with the intention to
# remove it in Go 1.18, which breaks projects using the dep tool.
# https://blog.golang.org/go116-module-changes
export GO111MODULE=auto
export GOPRIVATE=github.com/DataDog
# Configure Go to pull go.ddbuild.io packages.
export GOPROXY=binaries.ddbuild.io,https://proxy.golang.org,direct
export GONOSUMDB=github.com/DataDog,go.ddbuild.io
# END ANSIBLE MANAGED BLOCK
