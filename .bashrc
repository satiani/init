# ~/.bashrc: executed by bash(1) for non-login shells.
# see /usr/share/doc/bash/examples/startup-files (in the package bash-doc)
# for examples


if [ -f /etc/bash_completion ]; then
    . /etc/bash_completion
fi

source /etc/profile.d/*.sh

# If running interactively, then:
if [ "$PS1" ]; then

    # don't put duplicate lines in the history. See bash(1) for more options
    export HISTCONTROL=ignoredups

    # check the window size after each command and, if necessary,
    # update the values of LINES and COLUMNS.
    shopt -s checkwinsize

    # enable color support of ls and also add handy aliases
    if [ "$TERM" != "dumb" ]; then
        alias ls='ls --color=auto'
    fi

    # some more ls aliases
    alias ll='ls -l'
    alias la='ls -A'
    #alias l='ls -CF'

    # set a fancy prompt
    PS1="\[\033[0;33m\]\w\n\[\033[0;32m\]\u@\h$ \[\033[0;37;00m\]"

    # If this is an xterm set the title to user@host:dir
    case $TERM in
    xterm*)
        PROMPT_COMMAND='echo -ne "\033]0;${USER}@${HOSTNAME}: ${PWD}\007"'
        ;;
    *)
        ;;
    esac
fi

[ -f ~/.fzf.bash ] && source ~/.fzf.bash
