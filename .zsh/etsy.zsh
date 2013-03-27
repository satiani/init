alias web='cd ~/development/Web'
alias search='cd ~/development/Search'
alias errors="tail -f /etc/httpd/logs/php.log"

alias mcflush='echo "flush_all" | nc 127.0.0.1 11211'

export MANPATH=/usr/local/share/man:/usr/share/man:/usr/X11/man
alias ack-grep='TERM=vt100 ack'
alias ack='TERM=vt100 ack'
if [ "$(hostname)" != "satiani.vm.ny4dev.etsy.com" ]; then
    alias gist='ssh satiani-vm gist'
fi;
alias try='try -P'
if which dbaliases > /dev/null 2>&1; then
    eval $(dbaliases)
fi;
