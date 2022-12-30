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
ON_A_MAC=`([[ $( uname ) == "Darwin" ]] && echo "true") || echo "false"`
export PATH=~/.local/bin:~/.cargo/bin:$PATH
if [ $ON_A_MAC == "true" ]; then
	if ! [ -d /opt/homebrew/opt/coreutils/libexec/gnubin ]; then
		echo "Consider brew install coreutils to use GNU utils"
	else
		export PATH=/opt/homebrew/opt/coreutils/libexec/gnubin:$PATH
		alias ls='ls --color=auto'
	fi;
fi;
