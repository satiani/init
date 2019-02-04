#!/bin/bash
# vim:foldmethod=marker
# Preamble {{{
set -e

SCRIPT_DIR=$(cd `dirname $0` && pwd)
ON_A_MAC=`([ $( uname ) == "Darwin" ] && echo "true") || echo "false"`
# }}}
# Requirements test {{{
REQUIRED_COMMANDS=(zsh curl tmux git npm virtualenv pip pip3 python3 python)
for i in "${REQUIRED_COMMANDS[@]}"; do
    if ! [ -x "$(command -v $i)" ]; then
        echo "Please install $i before running this script"
        exit 255
    fi
done
# }}}
# bin dir {{{
[ -e ~/bin ] || mkdir -pv ~/bin
export PATH=~/.local/bin:~/.cargo/bin:/usr/local/bin:/usr/bin:$PATH:~/bin
# }}}
# tmux plugin manager {{{
if ! [ -d ~/.tmux ]; then
    git clone https://github.com/tmux-plugins/tpm ~/.tmux/plugins/tpm
fi
# }}}
# rust/cargo {{{
if ! [ -x "$(command -v cargo)" ]; then
    curl https://sh.rustup.rs -sSf | sh
else
    echo "Skipping rust/cargo"
fi
# }}}
# ripgrep {{{
if ! [ -x "$(command -v rg)" ]; then
    bash <<EOF
    cargo_install() {
        cargo install ripgrep
    }
    cd $(mktemp -d)
    wget https://github.com/BurntSushi/ripgrep/releases/download/0.10.0/ripgrep_0.10.0_amd64.deb
    trap "cargo_install" SIGINT
    echo "Please enter sudo password or press Ctrl-C to install from cargo"
    sudo dpkg -i ripgrep_0.10.0_amd64.deb
    trap - SIGINT
EOF
else
    echo "Skipping ripgrep"
fi
# }}}
# fzf {{{
if ! [ -d ~/.fzf ]; then
    git clone --depth 1 https://github.com/junegunn/fzf.git ~/.fzf
    ~/.fzf/install
    mkdir -p ~/.man/man1
    cp -r ~/.fzf/man/man1/* ~/.man/man1
else
    echo "Skipping fzf installation"
fi
# }}}
# fpp {{{
if [ ! -d ~/bin/PathPicker ]; then
    git clone https://github.com/facebook/PathPicker.git ~/bin/PathPicker
    ln -sv ~/bin/PathPicker/fpp ~/bin/fpp
else
    echo "Skipping fpp installation"
fi
# }}}
# utils from npm {{{
if [ -x "$(command -v npm)" ] && (! [ -f ~/bin/fixjson ] || ! [ -f ~/bin/jsctags ]); then
    bash<<EOF
    cd ~/bin
    npm install fixjson git+https://github.com/ramitos/jsctags.git
    [ -f ~/bin/fixjson ] || ln -sv node_modules/.bin/fixjson .
    [ -f ~/bin/jsctags ] || ln -sv node_modules/.bin/jsctags .
EOF
else
    echo "Skipping utils from npm installation"
fi
# }}}
# language servers {{{
[ -d ~/.langservers ] || mkdir ~/.langservers
# }}}
# javascript language server {{{
if [ -x "$(command -v npm)" ] && ! [ -d ~/.langservers/javascript ]; then
    bash<<EOF
    mkdir ~/.langservers/javascript
    cd ~/.langservers/javascript
    cp $SCRIPT_DIR/javascriptls.sh ./run.sh
    npm install -E ternjs tern
EOF
else
    echo "Skipping javascript language server installation."
fi
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
    ln -s $SCRIPT_DIR/$i $HOME
done
# }}}
# install vim plug {{{
if [ ! -f ~/.local/share/nvim/site/autoload/plug.vim ]; then
    curl -fLo ~/.local/share/nvim/site/autoload/plug.vim --create-dirs \
        https://raw.githubusercontent.com/satiani/vim-plug/master/plug.vim
fi
# }}}
# htop config {{{
HTOP_PATH=$HOME/.config/htop/
mkdir -pv $HTOP_PATH
if [ -f $HTOP_PATH/htoprc -o -L $HTOP_PATH/htoprc ]; then
    rm -f ${HTOP_PATH}/htoprc.old
    mv $HTOP_PATH/htoprc $HTOP_PATH/htoprc.old
fi;
ln -s $SCRIPT_DIR/htoprc $HTOP_PATH
# }}}
# vim/nvim {{{
mkdir -pv $HOME/vimswap
mkdir -pv $HOME/.config/nvim/

if ! [ -e $HOME/.config/nvim/init.vim ]; then
    ln -sv $HOME/.vimrc $HOME/.config/nvim/init.vim
fi

if ! [ -d ~/.local/python-envs ]; then
    bash<<EOF
    mkdir -pv ~/.local/python-envs
    cd ~/.local/python-envs
    virtualenv --python /usr/local/bin/python3 venv3
    source venv3/bin/activate
    pip install neovim jedi sqlparse
    virtualenv --python /usr/bin/python venv2
    source venv2/bin/activate
    pip install neovim
EOF
else
    echo "Skipping nvim envs installation."
fi

if ! [ -x "$(command -v nvr)" ]; then
    pip3 install --user neovim-remote
else
    echo "Skipping nvr installation."
fi

if ! [ -x "$(command -v nvim)" ]; then
    bash<<EOF
    cd $(mktemp -d)
    curl -LO https://github.com/neovim/neovim/releases/download/nightly/nvim.appimage
    chmod u+x nvim.appimage
    ./nvim.appimage --appimage-extract
    rsync -avz ./squashfs-root/usr/ ~/.local/
EOF
else
    echo "Skipping nvim installation."
fi

if ! [ -d ~/.local/share/nvim/plugged ]; then
    VIMINIT='let g:first_time_install=1 | source ~/.vimrc' nvim +PlugInstall +qall
else
    echo "Skipping PlugInstall"
fi
# }}}
echo "Done."
