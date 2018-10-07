#!/bin/bash
# vim:foldmethod=marker
# Preamble {{{
set -e

SCRIPT_DIR=$(cd `dirname $0` && pwd)
ON_A_MAC=`([ $( uname ) == "Darwin" ] && echo "true") || echo "false"`
MAC_BINARIES="$ON_A_MAC"
# }}}
# functions {{{
function link_bin () {
    [ -z $1 ] && echo "No input" && return 1
    [ -e ~/bin ] || mkdir -pv ~/bin

    BASENAME=`basename $1`
    [ -e ~/bin/$BASENAME ] && echo "Skipping linking $1 to ~/bin" && return
    ln -sv $1 ~/bin/$BASENAME
}
# }}}
# rust/cargo {{{
export PATH=~/.cargo/bin/:$PATH
if ! [ -x "$(command -v cargo)" ]; then
    if $MAC_BINARIES; then
        cp -rv ~/code/init/binaries/osx/.cargo ~/
    else
        curl https://sh.rustup.rs -sSf | sh
    fi
fi
# }}}
# tmux plugin manager {{{
if ! [ -d ~/.tmux ]; then
    git clone https://github.com/tmux-plugins/tpm ~/.tmux/plugins/tpm
fi
# }}}
# ripgrep {{{
if ! [ -x "$(command -v rg)" ]; then
    cargo install ripgrep
fi
# }}}
# fzf {{{
if ! [ -d ~/.fzf ]; then
    if $MAC_BINARIES; then
        cp -rv ~/code/init/binaries/osx/.fzf ~/
    else
        git clone --depth 1 https://github.com/junegunn/fzf.git ~/.fzf
        ~/.fzf/install
        mkdir -p ~/.man/man1
        cp -r ~/.fzf/man/man1/* ~/.man/man1
    fi
else
    echo "Skipping fzf installation"
fi
# }}}
# language servers {{{
[ -d ~/.langservers ] || mkdir ~/.langservers
# }}}
# python language server {{{
if [ -x "$(command -v virtualenv)" ] && ! [ -d ~/.langservers/python ]; then
    bash<<EOF
    mkdir ~/.langservers/python
    cd ~/.langservers/python
    virtualenv venv
    source venv/bin/activate
    pip install python-language-server
    pip install python-language-server[rope]
    pip install python-language-server[mccabe]
    cp $SCRIPT_DIR/pythonls.sh ./run.sh
EOF
else
    echo "Skipping python language server installation."
fi
# }}}
# javascript language server {{{
if [ -x "$(command -v npm)" ] && ! [ -d ~/.langservers/javascript ]; then
    bash<<EOF
    mkdir ~/.langservers/javascript
    cd ~/.langservers/javascript
    cp $SCRIPT_DIR/javascriptls.sh ./run.sh
    npm install -E ternjs
EOF
else
    echo "Skipping javascript language server installation."
fi
# }}}
# typescript language server {{{
if [ -x "$(command -v npm)" ] && ! [ -d ~/.langservers/typescript ]; then
    bash<<EOF
    mkdir ~/.langservers/typescript
    cd ~/.langservers/typescript
    git clone https://github.com/sourcegraph/javascript-typescript-langserver tsserver
    cd tsserver
    npm install
    npm run build
    chmod +x lib/language-server*.js
EOF
else
    echo "Skipping typescript language server installation."
fi
# }}}
# install dein {{{
source $SCRIPT_DIR/lib.sh
install_dein ~/.cache/dein > /dev/null
# }}}
# dotfiles {{{
for i in .*; do
    if [ $i == "." ] || [ $i == ".." ] || [ $i == ".git" ] || [ $i == *.old ]; then
        continue
    fi
    home_path=$HOME/`basename $i`
    if [ -f $home_path -o -L $home_path ]; then
        rm -f ${home_path}.old
        mv $home_path ${home_path}.old
    fi;
    ln -s $PWD/$i $HOME
done
# }}}
# bin {{{
link_bin $SCRIPT_DIR/push.sh
link_bin $SCRIPT_DIR/get.sh
# }}}
# vim/nvim {{{
mkdir -pv $HOME/vimswap
mkdir -pv $HOME/.config/nvim/

if ! [ -e $HOME/.config/nvim/init.vim ]; then
    ln -sv $HOME/.vimrc $HOME/.config/nvim/init.vim
fi

if ! [ -x "$(command -v nvr)" ]; then
    pip3 install --user neovim-remote
else
    echo "Skipping nvr installation."
fi
# }}}
# configure git {{{
git config --global user.name "Samer Atiani"
git config --global user.email "satiani@gmail.com"
git config --global color.ui auto
git config --global alias.st status
git config --global push.default simple
# }}}
echo "Done."
