# vim:foldmethod=marker
# Zsh configuration
# Samer Atiani - 2018
# Zsh options {{{
setopt autocd                   # if command isn't executable, try to cd to directory
setopt extendedglob             # more filename generation features
setopt auto_pushd               # automatically push old directory to stack
setopt pushd_ignore_dups        # ignore dups when doing pushd
setopt no_list_beep             # no beep on ambiguous completions
setopt extended_history         # save timestamp and duration in command history
setopt no_hist_beep             # no beep on history
setopt hist_ignore_all_dups     # ignore dups in history
setopt hist_ignore_space        # when commands are prepended by space, don't save them to disk
setopt hist_reduce_blanks       # remove superfluous blanks before saving in history
setopt print_exit_value         # print exit value on non-zero exits
setopt no_beep                  # no beeps
setopt auto_resume              # single word commands are candidates for job resumption
setopt no_nomatch               # if there are no matches for globs, don't throw an error, leave it alone
setopt no_cdable_vars           # don't use named directories in cd autocompletion
setopt prompt_subst             # enable substitutions to happen in prompt variables
# }}}
# Zsh plugins {{{
autoload -U url-quote-magic
zle -N self-insert url-quote-magic
autoload edit-command-line
zle -N edit-command-line
autoload colors; colors;
# }}}
# Keybindings {{{
bindkey -v
bindkey -M vicmd 'v' edit-command-line
bindkey '^R' history-incremental-search-backward
bindkey 'OA' up-line-or-history #application mode binding
bindkey '[A' up-line-or-history
bindkey '[1~' beginning-of-line
bindkey 'OH' beginning-of-line
bindkey '[4~' end-of-line
bindkey 'OF' end-of-line
bindkey '' backward-delete-char
bindkey '[3~' delete-char
bindkey '' run-help
# }}}
# Exports {{{
export ON_A_MAC=`([ $( uname ) == "Darwin" ] && echo "true") || echo "false"`
export PATH="$HOME/bin:$HOME/.local/bin:$HOME/.cargo/bin:/usr/local/bin:/usr/local/opt/gnu-sed/libexec/gnubin:/usr/bin/:/bin:/usr/local/sbin:/usr/sbin:/sbin"
[ "$ON_A_MAC" == "true" ] && export PATH="$PATH:$HOME/Library/Python/3.7/bin"
export VIM_BIN="vim"
[ "$(command -v nvim)" ] && export VIM_BIN="nvim"
! [ -z "$NVIM_LISTEN_ADDRESS" ] && [ "$(command -v nvr)" ] && export VIM_BIN="nvr -s --remote-tab"
export LSCOLORS="Gxfxcxdxbxegedabagacad"
export LC_ALL=en_US.UTF-8
export EDITOR="$VIM_BIN"
export HISTFILE=~/.histfile
export HISTSIZE=1000
export SAVEHIST=1000
export MANPATH=~/.man/:$MANPATH
# }}}
# Aliases {{{
alias vi="$VIM_BIN"
alias vim="$VIM_BIN"
alias speedtest='wget -O /dev/null http://speedtest.wdc01.softlayer.com/downloads/test100.zip'
[[ "$ON_A_MAC" == "false" ]] && alias ls='ls --color=auto' || alias ls='ls -G'
alias grep='grep --color=auto'
alias site='cd ~/code/web && source venv/bin/activate && export PYTHONPATH=.'
alias sudo='sudo '
# }}}
# Compinstall {{{
# The following lines were added by compinstall

zstyle ':completion:*' completer _expand _complete _ignored _correct _approximate
zstyle ':completion:*' max-errors 1
zstyle :compinstall filename '/home/satiani/.zshrc'

autoload -Uz compinit
compinit
# End of lines added by compinstall
# }}}
# Custom functions {{{
_fzf_compgen_path() {
  rg --files --follow --glob "!.git/*" "$1" 2>/dev/null
}
# }}}
# Sourcing external files {{{
for zsh_file (~/.zsh/**/*.zsh) source $zsh_file

[ -f ~/.fzf.zsh ] && source ~/.fzf.zsh
export FZF_COMPLETION_TRIGGER='/'
export FZF_DEFAULT_COMMAND='rg --no-ignore --files --follow -uu 2>/dev/null'
export FZF_DEFAULT_OPTS='--bind ctrl-d:page-down,ctrl-u:page-up'
# }}}

export PATH="$HOME/.yarn/bin:$HOME/.config/yarn/global/node_modules/.bin:$PATH"
