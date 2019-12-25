if [ "$(whoami)" = "root" ]; then CARETCOLOR="cyan"; else CARETCOLOR="white"; fi

FILTER_STR="inet addr:"
CUT=":"

[ $ON_A_MAC == "true" ] && FILTER_STR="inet[^6]" && CUT=" "

IP_ADDR=$(/sbin/ifconfig | grep "$FILTER_STR" | grep -v '127.0.0.1' | cut -d "$CUT" -f2 | awk '{ print $1}' | head -n 1)
HOSTNAME=$(hostname)

HOSTNAME="$HOSTNAME%{$reset_color%}"

PROMPT='[%n @ $HOSTNAME ($IP_ADDR)]$(git_prompt_info)
%{${fg_bold[yellow]}%}%~%{$reset_color%} %{${fg_bold[$CARETCOLOR]}%}%%%{${reset_color}%} '

CLICOLOR=1

ZSH_THEME_GIT_PROMPT_PREFIX="[%{$fg_bold[magenta]%}"
ZSH_THEME_GIT_PROMPT_SUFFIX="%{$reset_color%}]"
ZSH_THEME_GIT_PROMPT_DIRTY="%{$fg[blue]%}*%{$reset_color%}"
ZSH_THEME_GIT_PROMPT_CLEAN=""
