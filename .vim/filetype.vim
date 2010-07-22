augroup filetypedetect
        au BufNewFile,BufRead .tmux.conf*,tmux.conf* setf tmux
        au BufNewFile,BufRead *.lib,*.include,*.install,*.module setf php
augroup END
