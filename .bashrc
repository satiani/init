# ~/.bashrc: executed by bash(1) for non-login shells.
# see /usr/share/doc/bash/examples/startup-files (in the package bash-doc)
# for examples

#PSC() { echo -ne "\033[${1:-0;38}m"; }
#
#function PWD(){
#    echo "$*" | sed "s:^$HOME:~:;s:^\(.\{10\}\).\{3\}.*\(.\{20\}\):\1$(PSC 31)...$(PSC "0;37")\2:";
#}

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
	#alias dir='ls --color=auto --format=vertical'
	#alias vdir='ls --color=auto --format=long'
    fi

    # some more ls aliases
    alias ll='ls -l'
    alias la='ls -A'
    #alias l='ls -CF'

    # set a fancy prompt
    #PS1='${debian_chroot:+($debian_chroot)}\u@\h:$(PWD \w)\$ '
    #PS1='${debian_chroot:+($debian_chroot)}\u@\h:\w\$ '
    PS1="\[\033[0;33m\]\w\n\[\033[0;32m\]\u@\h$ \[\033[0;37;00m\]"

    # If this is an xterm set the title to user@host:dir
    case $TERM in
    xterm*)
        PROMPT_COMMAND='echo -ne "\033]0;${USER}@${HOSTNAME}: ${PWD}\007"'
        ;;
    *)
        ;;
    esac

    # enable programmable completion features (you don't need to enable
    # this, if it's already enabled in /etc/bash.bashrc).
    #if [ -f /etc/bash_completion ]; then
    #  . /etc/bash_completion
    #fi
fi

export ORACLE_HOME=/opt/wgoracle-client/u01/app/oracle/product/10.2.0.3.0
export RASERVER_HOME=/home/satiani/tptp
export LD_LIBRARY_PATH=$RASERVER_HOME/lib:$LD_LIBRARY_PATH:$ORACLE_HOME/lib
export JAVA_HOME=/usr/lib/jvm/java-6-sun
export PATH=$HOME/bin:$HOME/.gem/ruby/1.8/bin:$PATH:$ORACLE_HOME/bin:/usr/sbin:$RASERVER_HOME/bin
export GREP_COLOR='1;32'
export CVSROOT=:pserver:satiani@wgbuild01.wgenhq.net:/home/cvs/repository
export SVN=http://repository.wgenhq.net/svn
#export PYTHONPATH=/opt/wgen-3p/python-lib:~/code/HEAD/mclass/sync/biscotto/python:~/code/HEAD/mclass/common/python
export EDITOR=vim
export LC_ALL=C
export ECLIM_ECLIPSE_HOME=/home/satiani/eclipse
export VIEWS_DIR=/home/satiani/code/views_workspace/views
export KM_DIR=/home/satiani/code/km_workspace/km
export MCLASS_DIR=/home/atiani/mnt/workspace/mclass
export FIGNORE=CVS:.svn
export GDK_NATIVE_WINDOWS=true

alias +="pushd ."
alias _="popd"
alias sqlplus='rlwrap sqlplus'
alias stagingvpn='ssh -i ~/.ssh/stagingvpn-key stagingvpn'
alias autobuild='ssh -t -t crucible sudo -H -u autobuild bash'
alias grep='grep --color=auto'
alias xterm='xterm -fg gray -bg black -fn "-schumacher-*-medium-*-*-*-15-*-*-*-*-*-*-*"'
alias wgenpython='/opt/wgen-3p/python25/bin/python'
alias wgenipython='/opt/wgen-3p/python25/bin/ipython'
alias views="cd $VIEWS_DIR"
alias km="cd $KM_DIR"
alias mclass="cd $MCLASS_DIR"
alias cfm="cd ~/code/aris/trunk/cfm"


#alias xterm='xterm -fa monaco -fs 14 -bg black -fg gray'

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

bind Space:magic-space
