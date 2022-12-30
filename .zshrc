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
