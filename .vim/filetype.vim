augroup filetypedetect
        au BufNewFile,BufRead .tmux.conf*,tmux.conf* setf tmux
        au BufNewFile,BufRead pakefile,*.lib,*.include,*.install,*.module setf php
        au BufNewFile,BufRead *.ejs setf eruby
        au BufNewFile,BufRead *.scss setf scss
        au BufRead,BufNewFile *.thrift setf thrift
        au BufRead,BufNewFile /etc/nginx/*.conf setf nginx
augroup END
