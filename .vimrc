"" Vim Options
set modeline
" see :help fo-table for meaning
set fo+=t
set wildmenu
set hidden
set t_Co=256
set completeopt=longest,menuone
if expand("$USER") == "satiani"
    set directory=$HOME/vimswap/
endif
set diffexpr="sdiff --strip-trailing-cr"
set diffopt=vertical,filler
set incsearch
set showmatch		" Show matching brackets.
set sw=4
set et
set expandtab
set sts=4
set viminfo='20,\"50
set suffixes=.bak,~,.swp,.o,.info,.aux,.log,.dvi,.bbl,.blg,.brf,.cb,.ind,.idx,.ilg,.inx,.out,.toc
set ruler
set printoptions=paper:letter
set history=50
set fileencodings=ucs-bom,utf-8,latin1
set backspace=indent,eol,start
set autoindent
set cpo&vim
set tags=tags;/
set laststatus=2
set grepprg=ack
set ignorecase
set smartcase
set cul
filetype plugin on

"#############################################

"" Key mappings
let mapleader=","
" file name completion
inoremap  
map <F1> <nop>
map <Leader>\ :n<CR>
map <Leader>- :prev<CR>
map <Leader>q :botright cwindow<CR>:setlocal nocul<CR>
map <Leader>n :cnewer<CR>
map <Leader>p :colder<CR>
map <Leader>y :call YankLineInfo(0)<CR>
map <Leader>Y :call YankLineInfo(1)<CR>
" Replace word under cursor
map <Leader>s :%s/\<<C-r><C-w>\>/
map <Leader>S :%s/\(\<<C-r><C-w>\>\)/
map <c-w>F <c-w>_<c-w><bar>
map <c-w>O <c-w>w<c-w>_<c-w><bar>
map <silent><F3>  :let NERDTreeQuitOnOpen=1<CR>:call SwitchToNerdTree("")<CR>
map <silent><F4>  :let NERDTreeQuitOnOpen=1<CR>:call SwitchToNerdTree("%")<CR>
map <silent><F5>  :let NERDTreeQuitOnOpen=0<CR>:call SwitchToNerdTree("")<CR>
map <silent> <F2> :call BufferList()<CR>:call ToggleCursorLine("__BUFFERLIST__")<CR>
map <silent> <c-g> :call ToggleOverLengthMatch()<CR>

"#############################################

"" General Settings
let g:last_pos = 0
syntax on
colorscheme desert256
highlight OverLength ctermbg=red ctermfg=white guibg=#592929
" Better filename matching
" Same as VIM default but without '=' and ','
let &isfname="@,48-57,/,.,-,_,+,#,$,%,~"

"#############################################

"" Plugin settings:

" NERDTree settings
let NERDTreeHijackNetrw=0
let NERDTreeWinSize=40

" TagList settings
let Tlist_Ctags_Cmd = '/usr/local/bin/ctags'
let Tlist_WinWidth = 50
let g:tlist_php_settings='php;f:function'

" command-t settings
let g:CommandTMatchWindowAtTop=1
let g:CommandTMaxHeight=10
let g:CommandTMaxFiles=20000
" map cancel to Escape
let g:CommandTCancelMap=''

" For BufferList (F2)
let g:BufferListMaxWidth = 60

" For Command-T
let g:CommandTMaxHeight = 10

"#############################################

"" Utility functions
function! ChangeCurrDir()
    let _dir = expand("%:p:h")
    exec join(["cd", escape(_dir, " ")])
    echo "Changed current directory to " . _dir
    unlet _dir
endfunction

function! SwitchToNerdTree(path)
    if exists("t:NERDTreeBufName")
        let winnr = bufwinnr(t:NERDTreeBufName)
        let currwinnr = bufwinnr("%")
        if winnr != -1 && winnr != currwinnr
            exec(winnr . "wincmd w")
            return
        elseif winnr != -1
            NERDTreeToggle
            return
        endif
    endif

    if a:path == "" 
        NERDTreeToggle
    else
        exec("NERDTree " . a:path)
    endif
endfunction

function! ToggleOverLengthMatch()
    if !exists("b:overlength_match_flag")
        "TODO: find a way to use a variable in the pattern used in the match
        "command. Without this, we'll have to use hardcoded overlength
        "thresholds. Using 'execute' trick doesn't work for some reason.
        match OverLength /\%91v.*/
        let b:overlength_match_flag = 1
        let b:previous_text_width = &tw
        setlocal tw=110
        echo "Changed textwidth to 90"
    else
        match none
        unlet b:overlength_match_flag
        "setlocal takes only number literals, to use variables
        "one must construct the command dynamically
        execute 'setlocal tw=' . b:previous_text_width
        echo "Reset textwidth to " . b:previous_text_width
        unlet b:previous_text_width
    endif
endfunction

function ToggleCursorLine(buf_name)
    if bufname("%") == a:buf_name
        setlocal nocul
        return
    endif
endfunction

function! YankLineInfo(get_contents)
    let curr_buff = bufname('%')
    let curr_line = line('.')
    let register = curr_buff . ":" . curr_line
    if a:get_contents
        let curr_contents = getline(line('.'))
        let register .= ":" . curr_contents
    endif
    call setreg('*', register)
endfunction

"#############################################

" load files in a directory that is not tracked by git
let local_path="$HOME/.vim/local/*.vim"
if glob(local_path) != ""
    exec("source " . local_path)
endif
