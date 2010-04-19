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
setopt appendhistory            # multiple sessions share history
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
#setopt hist_verify              # expand history before execution
setopt print_exit_value         # print exit value on non-zero exits
setopt no_beep                  # no beeps
setopt auto_resume              # single word commands are candidates for job resumption

autoload edit-command-line
zle -N edit-command-line

bindkey -v
bindkey -M vicmd 'v' edit-command-line
bindkey '^R' history-incremental-search-backward
bindkey 'OA' up-line-or-history #application mode binding
bindkey '[A' up-line-or-history
bindkey '[1~' beginning-of-line
bindkey '[4~' end-of-line
bindkey '' backward-delete-char

PROMPT='%d$ '                   # default prompt
RPROMPT='[%n@%M>%l]'            # prompt for right side of screen
export EDITOR=vim

alias ls='ls --color=auto'
alias views='cd ~/code/views_workspace/views'

export ORACLE_HOME=/opt/wgoracle-client/u01/app/oracle/product/10.2.0.3.0
export LD_LIBRARY_PATH=$LD_LIBRARY_PATH:$ORACLE_HOME/lib
export PATH=$HOME/bin:$PATH:$ORACLE_HOME/bin:/usr/sbin
export EDITOR=vim
export LC_ALL=C
