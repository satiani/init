#!/bin/bash
# vim:foldmethod=marker
# Preamble {{{
set -e

SCRIPT_DIR=$(cd `dirname $0` && pwd)
ON_A_MAC=`([ $( uname ) == "Darwin" ] && echo "true") || echo "false"`
# }}}
# bin dir {{{
[ -e ~/bin ] || mkdir -pv ~/bin
# }}}
# rust/cargo {{{
export PATH=~/.local/bin:$PATH
# }}}
# tmux plugin manager {{{
if ! [ -d ~/.tmux ]; then
    git clone https://github.com/tmux-plugins/tpm ~/.tmux/plugins/tpm
fi
# }}}
# ripgrep {{{
if ! [ -x "$(command -v rg)" ]; then
    if ! [ -x "$(command -v cargo)" ]; then
        curl https://sh.rustup.rs -sSf | sh
        export PATH=~/.cargo/bin/:$PATH
    fi
    cargo install ripgrep
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
# fixjson {{{
if [ -x "$(command -v npm)" ] && ! [ -f ~/bin/fixjson ]; then
    bash<<EOF
    cd ~/bin
    npm install fixjson
    ln -sv node_modules/.bin/fixjson .
EOF
else
    echo "Skipping fixjson installation"
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
    ln -s $PWD/$i $HOME
done
# }}}
# install vim plug {{{
if [ ! -f ~/.local/share/nvim/site/autoload/plug.vim ]; then
    curl -fLo ~/.local/share/nvim/site/autoload/plug.vim --create-dirs \
        https://raw.githubusercontent.com/satiani/vim-plug/master/plug.vim
fi
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
    pip install neovim jedi
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
# install termcolors {{
if [ -x $(command -v tic) ] && ! [ -e ~/.terminfo/*/tmux-256color ]; then
    echo "Compiling & installing termcolors"
    tic -x  $SCRIPT_DIR/tmux-256color.terminfo
    tic -x  $SCRIPT_DIR/xterm-256color-italic.terminfo
else
    echo "Skipping termcolors"
fi
# }}}
echo "Done."
