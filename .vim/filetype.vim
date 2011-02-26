augroup filetypedetect
        au BufNewFile,BufRead .tmux.conf*,tmux.conf* setf tmux
        au BufNewFile,BufRead *.lib,*.include,*.install,*.module setf php
        au BufNewFile,BufRead *.ejs setf eruby
        au BufNewFile,BufRead *.scss setf scss
augroup END
