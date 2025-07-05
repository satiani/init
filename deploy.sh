#!/bin/bash
# vim:foldmethod=marker
# Preamble {{{
set -e

SCRIPT_DIR=$(cd `dirname $0` && pwd)
ON_A_MAC=`([ $( uname ) == "Darwin" ] && echo "true") || echo "false"`
source $SCRIPT_DIR/common.sh
# }}}
# Requirements test {{{
test_required_commands zsh curl git tmux rsync cmake
# }}}
# bin dir {{{
export PATH=~/.local/bin:~/.cargo/bin:/usr/local/bin:/usr/bin:$PATH:~/bin
# }}}
# oh my zsh {{{
if ! [ -d ~/.oh-my-zsh ]; then
    git clone https://github.com/ohmyzsh/ohmyzsh.git ~/.oh-my-zsh
    ln -sv $SCRIPT_DIR/lscolors.zsh ~/.oh-my-zsh/custom
else
    echo "Skipping oh-my-zsh."
fi
# }}}
# rust/cargo {{{
if ! [ -x "$(command -v cargo)" ]; then
    curl https://sh.rustup.rs -sSf | sh
else
    echo "Skipping rust/cargo."
fi
# }}}
# ripgrep {{{
if ! [ -x "$(command -v rg)" ]; then
    cargo install ripgrep
else
    echo "Skipping ripgrep."
fi
if ! [ -e ~/.config/starship.toml ]; then
    mkdir -p ~/.config/
    ln -sv $SCRIPT_DIR/starship.toml ~/.config
else
    echo "Skipping starship config."
fi
# }}}
# starship {{{
if ! [ -x "$(command -v starship)" ]; then
    cargo install starship
else
    echo "Skipping starship."
fi
# }}}
# dotfiles {{{
for i in $SCRIPT_DIR/.*; do
    if [[ $i =~ \.git ]] || [[ $i == "$SCRIPT_DIR/." ]] || [[ $i == "$SCRIPT_DIR/.." ]]; then
        continue
    fi;
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
        rsync -avz ./nvim-macos/ ~/.local/
		EOF
    else
        bash<<-EOF
        cd $(mktemp -d)
        curl -LO https://github.com/neovim/neovim/releases/download/v0.11.2/nvim-linux-x86_64.appimage
        chmod u+x nvim-linux-x86_64.appimage
        ./nvim-linux-x86_64.appimage --appimage-extract
        rsync -avz ./squashfs-root/usr/ ~/.local/
		EOF
    fi
else
    echo "Skipping nvim installation."
fi
if ! [ -e ~/.config/nvim/init.lua ]; then
    mkdir -p ~/.config/nvim
    ln -sv $SCRIPT_DIR/init.lua ~/.config/nvim
else
    echo "Skipping nvim config."
fi
# }}}
echo "Done."
