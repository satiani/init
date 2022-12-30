#!/bin/bash
# vim:foldmethod=marker
# Preamble {{{
set -e

SCRIPT_DIR=$(cd `dirname $0` && pwd)
ON_A_MAC=`([ $( uname ) == "Darwin" ] && echo "true") || echo "false"`
source $SCRIPT_DIR/common.sh
# }}}
# Requirements test {{{
test_required_commands zsh curl git tmux
# }}}
# bin dir {{{
[ -e ~/bin ] || mkdir -pv ~/bin
export PATH=~/.local/bin:~/.cargo/bin:/usr/local/bin:/usr/bin:$PATH:~/bin
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
    cargo install ripgrep
else
    echo "Skipping ripgrep"
fi
# }}}
# dotfiles {{{
GLOBIGNORE=".git*"
for i in $SCRIPT_DIR/.*; do
    ensure_link $i
done
# }}}
# tmux {{{
if ! [ -d ~/.tmux ]; then
    git clone https://github.com/tmux-plugins/tpm ~/.tmux/plugins/tpm
fi
# }}}
# htop config {{{
HTOP_PATH=$HOME/.config/htop/
if ! [ -f $HTOP_PATH/htoprc -o -L $HTOP_PATH/htoprc ]; then
    mkdir -pv $HTOP_PATH
    ln -s $SCRIPT_DIR/htoprc $HTOP_PATH
else
    echo "Skipping htproc."
fi;
# }}}
# vim/nvim {{{
if ! [ -x "$(command -v nvim)" ]; then
    mkdir -pv $HOME/.config/nvim/
    if [ $ON_A_MAC == "true" ]; then
        bash<<-EOF
        cd $(mktemp -d)
        curl -LO https://github.com/neovim/neovim/releases/download/nightly/nvim-macos.tar.gz
        tar xf nvim-macos.tar.gz
        rsync -avz ./nvim-osx64/ ~/.local/
		EOF
    else
        bash<<-EOF
        cd $(mktemp -d)
        curl -LO https://github.com/neovim/neovim/releases/download/nightly/nvim.appimage
        chmod u+x nvim.appimage
        ./nvim.appimage --appimage-extract
        rsync -avz ./squashfs-root/usr/ ~/.local/
		EOF
    fi
else
    echo "Skipping nvim installation."
fi
# }}}
echo "Done."
