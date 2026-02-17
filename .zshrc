# Personal config

export PATH=~/.local/bin:~/.cargo/bin:$PATH
export PROMPT='%~ $ '
export LANG=en_US.UTF-8

set -o vi
bindkey '^R' history-incremental-search-backward
alias vi='nvim'
alias vim='nvim'

if [[ $( uname ) == "Darwin" ]]; then
    if ! [[ -d /opt/homebrew/opt/coreutils/libexec/gnubin ]]; then
        echo "Consider brew install coreutils to use GNU utils"
    else
        export PATH=/opt/homebrew/opt/coreutils/libexec/gnubin:$PATH
        alias ls='ls --color=auto'
        source ~/code/init/lscolors.zsh
    fi;
    if type brew &>/dev/null
    then
        FPATH="$(brew --prefix)/share/zsh/site-functions:${FPATH}"
        autoload -Uz compinit
        compinit
    fi
fi;

if command -v zoxide > /dev/null; then
    export _ZO_FZF_OPTS='--select-1 --exit-0'
    eval "$(zoxide init zsh)"
fi

[ -f ~/.fzf.zsh ] && source ~/.fzf.zsh
