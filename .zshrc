# The following lines were added by compinstall

zstyle ':completion:*' completer _expand _complete _ignored _correct _approximate
zstyle ':completion:*' max-errors 1
zstyle :compinstall filename '/home/satiani/.zshrc'

autoload -Uz compinit
compinit
# End of lines added by compinstall

#History file options
HISTFILE=~/.histfile
HISTSIZE=1000
SAVEHIST=1000

#zsh options
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

# zsh plugins
autoload -U url-quote-magic
zle -N self-insert url-quote-magic
autoload edit-command-line
zle -N edit-command-line
autoload colors; colors;

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

export EDITOR=vim
export ON_A_MAC=`([ $( uname ) == "Darwin" ] && echo "true") || echo "false"`
export LSCOLORS="Gxfxcxdxbxegedabagacad"

if [ $ON_A_MAC == "false" ]; then 
    alias ls='ls --color=auto'
    alias tmux='tmux -u -2'
else
    alias ls='ls -G'
    alias tmux='reattach-to-user-namespace -l tmux -u -2 -f ~/.tmux-osx.conf'
fi

alias grep='grep --color=auto'
#fuck vi
alias vi='vim'
alias svi='sudo vim'
alias speedtest='wget -O /dev/null http://speedtest.wdc01.softlayer.com/downloads/test100.zip'

#ack-grep and vim don't work perfectly within tmux 
#changing the TERM fixes their problems
if [ ! -z "$TMUX" ]; then
    alias ack-grep='TERM=vt100 ack-grep' 
    alias vi='TERM=xterm-256color vim'
    alias vim='TERM=xterm-256color vim'
fi

export EDITOR=vim
export LC_ALL=en_US.UTF-8
export PATH=/usr/local/opt/gnu-sed/libexec/gnubin:/usr/local/bin:$PATH:~/bin

if [ -f ~/.profile ]; then
    source ~/.profile
fi

# load all zsh files in .zsh
for zsh_file (~/.zsh/**/*.zsh) source $zsh_file

### Added by the Heroku Toolbelt
export PATH="/usr/local/heroku/bin:$PATH"
alias site='cd ~/code/web && source venv/bin/activate'
