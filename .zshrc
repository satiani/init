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
