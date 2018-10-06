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

export ORACLE_HOME=/opt/wgoracle-client/u01/app/oracle/product/10.2.0.3.0
export LD_LIBRARY_PATH=$RASERVER_HOME/lib:$LD_LIBRARY_PATH:$ORACLE_HOME/lib
export JAVA_HOME=/usr/lib/jvm/java-6-sun
export PATH=$HOME/bin:$PATH:$ORACLE_HOME/bin:/usr/sbin
export GREP_COLOR='1;32'
export CVSROOT=:pserver:satiani@wgbuild01.wgenhq.net:/home/cvs/repository
export SVN=http://repository.wgenhq.net/svn
export EDITOR=vim
export LC_ALL=C
export VIEWS_DIR=/home/satiani/code/views_workspace/views
export KM_DIR=/home/satiani/code/km_workspace/km

alias +="pushd ."
alias _="popd"
alias sqlplus='rlwrap sqlplus'
alias grep='grep --color=auto'
alias views="cd $VIEWS_DIR"
alias km="cd $KM_DIR"

bind Space:magic-space

svn(){
    #This is a hack to emulate cvs checkout behavior
    SVN_BIN=/usr/bin/svn
    DEFAULT_SVN=http://repository.wgenhq.net/svn
    if [ "$2" != "" ] && [ "$1" == "co" ]; then
        if [ `echo $2 | sed 's|.\+://.\+|yes|'` != "yes" ]; then
            SVN_URI=$DEFAULT_SVN/$2
        else
            SVN_URI=$2
        fi
        eval `echo $SVN_URI | sed 's|\(.\+://[^/]\+/[^/]\+/\)\(.\+\)|$SVN_BIN co \1\2 \2|'`
    else
        $SVN_BIN $*
    fi
}

add_jars_to_classpath(){
    TARGET_DIR=`cd $1 && pwd`
    RETURN_CODE=$?
    [ "$RETURN_CODE" -ne "0" ] && return $RETURN_CODE
    unset OUT
    for JAR in $( find $TARGET_DIR -name "*.jar" ); do
        OUT="$OUT:$JAR"
    done;
    if [ -z "$CLASSPATH" ]; then
        export CLASSPATH=.$OUT
    else
        export CLASSPATH=$CLASSPATH$OUT
    fi
}


[ -f ~/.fzf.bash ] && source ~/.fzf.bash
