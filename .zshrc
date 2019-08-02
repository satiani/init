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
export PATH="$HOME/bin:$HOME/.local/bin:$HOME/.cargo/bin:/usr/local/bin:/usr/local/opt/gnu-sed/libexec/gnubin:/usr/bin/:/bin:/usr/local/sbin:/usr/sbin:/sbin:/usr/local/go/bin:$HOME/go/bin"
[ "$ON_A_MAC" == "true" ] && export PATH="$PATH:$HOME/Library/Python/3.7/bin"
export VIM_BIN="vim"
[ "$(command -v nvim)" ] && export VIM_BIN="nvim"
! [ -z "$NVIM_LISTEN_ADDRESS" ] && [ "$(command -v nvr)" ] && export VIM_BIN="nvr -s --remote-tab"
# LS_COLORS {{{
export LSCOLORS=ExGxBxDxCxEgEdxbxgxcxd
export LS_COLORS="no=0:*~=0;38;2;102;102;102:so=0;38;2;0;0;0;48;2;255;106;193:or=0;38;2;0;0;0;48;2;255;92;87:ex=1;38;2;255;92;87:pi=0;38;2;0;0;0;48;2;87;199;255:mi=0;38;2;0;0;0;48;2;255;92;87:di=0;38;2;87;199;255:ln=0;38;2;255;106;193:fi=0:*.t=0;38;2;90;247;142:*.p=0;38;2;90;247;142:*.m=0;38;2;90;247;142:*.r=0;38;2;90;247;142:*.a=1;38;2;255;92;87:*.z=4;38;2;154;237;254:*.c=0;38;2;90;247;142:*.h=0;38;2;90;247;142:*.d=0;38;2;90;247;142:*.o=0;38;2;102;102;102:*.ps=0;38;2;255;92;87:*.bz=4;38;2;154;237;254:*.cp=0;38;2;90;247;142:*.rb=0;38;2;90;247;142:*.cs=0;38;2;90;247;142:*.mn=0;38;2;90;247;142:*.hi=0;38;2;102;102;102:*.cr=0;38;2;90;247;142:*.rs=0;38;2;90;247;142:*.gz=4;38;2;154;237;254:*.ml=0;38;2;90;247;142:*.rm=0;38;2;255;180;223:*.pl=0;38;2;90;247;142:*.di=0;38;2;90;247;142:*.hh=0;38;2;90;247;142:*.ko=1;38;2;255;92;87:*.gv=0;38;2;90;247;142:*.cc=0;38;2;90;247;142:*css=0;38;2;90;247;142:*.ex=0;38;2;90;247;142:*.kt=0;38;2;90;247;142:*.go=0;38;2;90;247;142:*.nb=0;38;2;90;247;142:*.hs=0;38;2;90;247;142:*.la=0;38;2;102;102;102:*.fs=0;38;2;90;247;142:*.ui=0;38;2;243;249;157:*.7z=4;38;2;154;237;254:*.sh=0;38;2;90;247;142:*.js=0;38;2;90;247;142:*.as=0;38;2;90;247;142:*.pp=0;38;2;90;247;142:*.jl=0;38;2;90;247;142:*.vb=0;38;2;90;247;142:*.ts=0;38;2;90;247;142:*.el=0;38;2;90;247;142:*.pm=0;38;2;90;247;142:*.lo=0;38;2;102;102;102:*.xz=4;38;2;154;237;254:*.py=0;38;2;90;247;142:*.so=1;38;2;255;92;87:*.md=0;38;2;243;249;157:*.xml=0;38;2;243;249;157:*.sty=0;38;2;102;102;102:*.pgm=0;38;2;255;180;223:*.hxx=0;38;2;90;247;142:*.idx=0;38;2;102;102;102:*.dox=0;38;2;165;255;195:*.kts=0;38;2;90;247;142:*.exs=0;38;2;90;247;142:*.sxw=0;38;2;255;92;87:*.swp=0;38;2;102;102;102:*.ini=0;38;2;243;249;157:*.rar=4;38;2;154;237;254:*.rtf=0;38;2;255;92;87:*.ipp=0;38;2;90;247;142:*.tsx=0;38;2;90;247;142:*.wmv=0;38;2;255;180;223:*.pas=0;38;2;90;247;142:*.kex=0;38;2;255;92;87:*.tcl=0;38;2;90;247;142:*.odp=0;38;2;255;92;87:*.pbm=0;38;2;255;180;223:*.sql=0;38;2;90;247;142:*.mid=0;38;2;255;180;223:*.wav=0;38;2;255;180;223:*.elm=0;38;2;90;247;142:*.bin=4;38;2;154;237;254:*.ics=0;38;2;255;92;87:*.asa=0;38;2;90;247;142:*.odt=0;38;2;255;92;87:*.pdf=0;38;2;255;92;87:*.blg=0;38;2;102;102;102:*.pps=0;38;2;255;92;87:*.ltx=0;38;2;90;247;142:*.png=0;38;2;255;180;223:*.nix=0;38;2;243;249;157:*.rst=0;38;2;243;249;157:*.csv=0;38;2;243;249;157:*.xcf=0;38;2;255;180;223:*.pod=0;38;2;90;247;142:*.mli=0;38;2;90;247;142:*.dpr=0;38;2;90;247;142:*.tar=4;38;2;154;237;254:*.hpp=0;38;2;90;247;142:*.rpm=4;38;2;154;237;254:*.pid=0;38;2;102;102;102:*.zsh=0;38;2;90;247;142:*.aux=0;38;2;102;102;102:*.cfg=0;38;2;243;249;157:*.ico=0;38;2;255;180;223:*.fon=0;38;2;255;180;223:*.txt=0;38;2;243;249;157:*.clj=0;38;2;90;247;142:*.xlr=0;38;2;255;92;87:*hgrc=0;38;2;165;255;195:*.mov=0;38;2;255;180;223:*.yml=0;38;2;243;249;157:*.dot=0;38;2;90;247;142:*.xls=0;38;2;255;92;87:*.cgi=0;38;2;90;247;142:*.bmp=0;38;2;255;180;223:*.doc=0;38;2;255;92;87:*.sxi=0;38;2;255;92;87:*.out=0;38;2;102;102;102:*.c++=0;38;2;90;247;142:*.pkg=4;38;2;154;237;254:*.lua=0;38;2;90;247;142:*.awk=0;38;2;90;247;142:*.ogg=0;38;2;255;180;223:*.gif=0;38;2;255;180;223:*.fsi=0;38;2;90;247;142:*.mkv=0;38;2;255;180;223:*.ppm=0;38;2;255;180;223:*.flv=0;38;2;255;180;223:*.vob=0;38;2;255;180;223:*.cpp=0;38;2;90;247;142:*.swf=0;38;2;255;180;223:*.com=1;38;2;255;92;87:*.git=0;38;2;102;102;102:*.vim=0;38;2;90;247;142:*.exe=1;38;2;255;92;87:*.gvy=0;38;2;90;247;142:*.tbz=4;38;2;154;237;254:*.h++=0;38;2;90;247;142:*.mp4=0;38;2;255;180;223:*.bst=0;38;2;243;249;157:*.bbl=0;38;2;102;102;102:*.vcd=4;38;2;154;237;254:*.ps1=0;38;2;90;247;142:*.fsx=0;38;2;90;247;142:*.toc=0;38;2;102;102;102:*.php=0;38;2;90;247;142:*.fnt=0;38;2;255;180;223:*.tgz=4;38;2;154;237;254:*.svg=0;38;2;255;180;223:*.bag=4;38;2;154;237;254:*.m4v=0;38;2;255;180;223:*.ilg=0;38;2;102;102;102:*.deb=4;38;2;154;237;254:*.img=4;38;2;154;237;254:*.otf=0;38;2;255;180;223:*.ods=0;38;2;255;92;87:*.bib=0;38;2;243;249;157:*.ttf=0;38;2;255;180;223:*.avi=0;38;2;255;180;223:*.mpg=0;38;2;255;180;223:*.jar=4;38;2;154;237;254:*.wma=0;38;2;255;180;223:*.ind=0;38;2;102;102;102:*.erl=0;38;2;90;247;142:*.ppt=0;38;2;255;92;87:*.log=0;38;2;102;102;102:*.jpg=0;38;2;255;180;223:*.pyc=0;38;2;102;102;102:*.inl=0;38;2;90;247;142:*.bak=0;38;2;102;102;102:*.tml=0;38;2;243;249;157:*.mp3=0;38;2;255;180;223:*.epp=0;38;2;90;247;142:*.bat=1;38;2;255;92;87:*.bz2=4;38;2;154;237;254:*TODO=1:*.tmp=0;38;2;102;102;102:*.bsh=0;38;2;90;247;142:*.htc=0;38;2;90;247;142:*.htm=0;38;2;243;249;157:*.tex=0;38;2;90;247;142:*.apk=4;38;2;154;237;254:*.bcf=0;38;2;102;102;102:*.pro=0;38;2;165;255;195:*.aif=0;38;2;255;180;223:*.fls=0;38;2;102;102;102:*.csx=0;38;2;90;247;142:*.tif=0;38;2;255;180;223:*.dmg=4;38;2;154;237;254:*.arj=4;38;2;154;237;254:*.xmp=0;38;2;243;249;157:*.cxx=0;38;2;90;247;142:*.dll=1;38;2;255;92;87:*.sbt=0;38;2;90;247;142:*.zip=4;38;2;154;237;254:*.iso=4;38;2;154;237;254:*.diff=0;38;2;90;247;142:*.pptx=0;38;2;255;92;87:*.psm1=0;38;2;90;247;142:*.psd1=0;38;2;90;247;142:*.rlib=0;38;2;102;102;102:*.dart=0;38;2;90;247;142:*.toml=0;38;2;243;249;157:*.less=0;38;2;90;247;142:*.hgrc=0;38;2;165;255;195:*.epub=0;38;2;255;92;87:*.fish=0;38;2;90;247;142:*.yaml=0;38;2;243;249;157:*.xlsx=0;38;2;255;92;87:*.lisp=0;38;2;90;247;142:*.bash=0;38;2;90;247;142:*.jpeg=0;38;2;255;180;223:*.html=0;38;2;243;249;157:*.json=0;38;2;243;249;157:*.flac=0;38;2;255;180;223:*.make=0;38;2;165;255;195:*.tbz2=4;38;2;154;237;254:*.java=0;38;2;90;247;142:*.orig=0;38;2;102;102;102:*.mpeg=0;38;2;255;180;223:*.lock=0;38;2;102;102;102:*.docx=0;38;2;255;92;87:*.conf=0;38;2;243;249;157:*.h264=0;38;2;255;180;223:*.purs=0;38;2;90;247;142:*.swift=0;38;2;90;247;142:*.cmake=0;38;2;165;255;195:*.mdown=0;38;2;243;249;157:*.dyn_o=0;38;2;102;102;102:*.cache=0;38;2;102;102;102:*.scala=0;38;2;90;247;142:*.cabal=0;38;2;90;247;142:*.xhtml=0;38;2;243;249;157:*.class=0;38;2;102;102;102:*.patch=0;38;2;90;247;142:*README=0;38;2;40;42;54;48;2;243;249;157:*.shtml=0;38;2;243;249;157:*passwd=0;38;2;243;249;157:*.toast=4;38;2;154;237;254:*shadow=0;38;2;243;249;157:*.ipynb=0;38;2;90;247;142:*.dyn_hi=0;38;2;102;102;102:*.flake8=0;38;2;165;255;195:*.ignore=0;38;2;165;255;195:*.groovy=0;38;2;90;247;142:*INSTALL=0;38;2;40;42;54;48;2;243;249;157:*LICENSE=0;38;2;153;153;153:*.config=0;38;2;243;249;157:*.matlab=0;38;2;90;247;142:*TODO.md=1:*.gradle=0;38;2;90;247;142:*COPYING=0;38;2;153;153;153:*Doxyfile=0;38;2;165;255;195:*setup.py=0;38;2;165;255;195:*Makefile=0;38;2;165;255;195:*TODO.txt=1:*.desktop=0;38;2;243;249;157:*.gemspec=0;38;2;165;255;195:*.markdown=0;38;2;243;249;157:*.fdignore=0;38;2;165;255;195:*COPYRIGHT=0;38;2;153;153;153:*.cmake.in=0;38;2;165;255;195:*.rgignore=0;38;2;165;255;195:*configure=0;38;2;165;255;195:*README.md=0;38;2;40;42;54;48;2;243;249;157:*.kdevelop=0;38;2;165;255;195:*.gitignore=0;38;2;165;255;195:*.scons_opt=0;38;2;102;102;102:*INSTALL.md=0;38;2;40;42;54;48;2;243;249;157:*SConstruct=0;38;2;165;255;195:*README.txt=0;38;2;40;42;54;48;2;243;249;157:*SConscript=0;38;2;165;255;195:*Dockerfile=0;38;2;243;249;157:*.gitconfig=0;38;2;165;255;195:*CODEOWNERS=0;38;2;165;255;195:*.travis.yml=0;38;2;90;247;142:*Makefile.am=0;38;2;165;255;195:*.synctex.gz=0;38;2;102;102;102:*.gitmodules=0;38;2;165;255;195:*MANIFEST.in=0;38;2;165;255;195:*Makefile.in=0;38;2;102;102;102:*LICENSE-MIT=0;38;2;153;153;153:*configure.ac=0;38;2;165;255;195:*CONTRIBUTORS=0;38;2;40;42;54;48;2;243;249;157:*.fdb_latexmk=0;38;2;102;102;102:*appveyor.yml=0;38;2;90;247;142:*.applescript=0;38;2;90;247;142:*.clang-format=0;38;2;165;255;195:*CMakeLists.txt=0;38;2;165;255;195:*LICENSE-APACHE=0;38;2;153;153;153:*INSTALL.md.txt=0;38;2;40;42;54;48;2;243;249;157:*.gitattributes=0;38;2;165;255;195:*CMakeCache.txt=0;38;2;102;102;102:*CONTRIBUTORS.md=0;38;2;40;42;54;48;2;243;249;157:*requirements.txt=0;38;2;165;255;195:*CONTRIBUTORS.txt=0;38;2;40;42;54;48;2;243;249;157:*.sconsign.dblite=0;38;2;102;102;102:*package-lock.json=0;38;2;102;102;102"
# }}}
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
[[ "$ON_A_MAC" == "true" ]] && alias ls='ls --color=auto' || alias ls='ls -G'
alias grep='grep --color=auto'
alias sudo='sudo '
alias watch='watch '
# }}}
# Compinstall {{{
# The following lines were added by compinstall

zstyle ':completion:*' completer _expand _complete _ignored _correct _approximate
zstyle ':completion:*' max-errors 1
zstyle :compinstall filename '/home/satiani/.zshrc'

autoload -Uz compinit
compinit
# End of lines added by compinstall
# The following line slows down ZSH startup significantly
# if [ $commands[kubectl] ]; then source <(kubectl completion zsh); fi
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
