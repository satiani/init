#/bin/bash
# Utility to copy any X text selection into clipboard. Bind it to some key in
# metacity for happinness and world peace, especially when using xterm or urxvt
# like terminals.
xclip -o sel pri | xclip -sel clip
