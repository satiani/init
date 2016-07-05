"" Vim Options
if expand("$USER") == "satiani"
    set directory=$HOME/vimswap/
    set undofile
    set undodir=$HOME/vimswap/
endif

let g:yankring_history_dir= expand('$HOME') . '/.yankring'
if ! isdirectory(g:yankring_history_dir)
    call mkdir(g:yankring_history_dir, "p")
endif

set autoindent
set backspace=indent,eol,start
set completeopt=longest,menuone
set cpo&vim
set cul
set diffexpr="sdiff --strip-trailing-cr"
set tw=0
set diffopt=vertical,filler
set expandtab
set fileencodings=ucs-bom,utf-8,latin1
" see :help fo-table for meaning
set fo+=t
set grepprg=ack
set hidden
set history=50
set ignorecase
set incsearch
set laststatus=2
set modeline
set printoptions=paper:letter
set ruler
set showmatch		" Show matching brackets.
set smartcase
set sts=4
set suffixes=.bak,~,.swp,.o,.info,.aux,.log,.dvi,.bbl,.blg,.brf,.cb,.ind,.idx,.ilg,.inx,.out,.toc
set sw=4
set t_Co=256
set tags=tags;/
set viminfo='20,\"50
set wildmenu
set wildignore+=*/*.class,*/*.o,*/*.lo,*/*.pyc,*/*.pyo
set nohlsearch
set mouse=n
filetype off
call pathogen#runtime_append_all_bundles()
call pathogen#helptags()
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
map <Leader>Q :botright lwindow<CR>:setlocal nocul<CR>
map <Leader>n :cnewer<CR>
map <Leader>p :colder<CR>
map <Leader>y :call YankLineInfo(0)<CR>
map <Leader>Y :call YankLineInfo(1)<CR>
map <Leader>m :call PutClockMd5Sum()<CR>
map <Leader>f :exec("gr " . expand("<cword>"))<CR>
" Replace word under cursor
map <Leader>s :%s/\<<C-r><C-w>\>/
map <Leader>S :%s/\(\<<C-r><C-w>\>\)/
map <c-w>F <c-w>_<c-w><bar>
map <c-w>O <c-w>w<c-w>_<c-w><bar>
map <silent><F3>  :let NERDTreeQuitOnOpen=1<CR>:call SwitchToNerdTree("")<CR>
map <silent><F4>  :let NERDTreeQuitOnOpen=1<CR>:call SwitchToNerdTree("%")<CR>
map <silent><F5>  :TlistToggle<CR>
map <silent> <F2> :call BufferList()<CR>:call ToggleCursorLine("__BUFFERLIST__")<CR>
map <silent> <c-g> :call ToggleOverLengthMatch()<CR>
map tk :tabfirst<CR>
map tl :tabnext<CR>
map th :tabprev<CR>
map tj :tablast<CR>
map tn :tabnew<CR>
vmap <Leader>t di{{ _('<Esc>pa') }}<Esc>
vmap <Leader>T di{{ _("""<Esc>pa""") }}<Esc>

"#############################################

"" General Settings
let g:last_pos = 0
syntax on
colorscheme desert256
highlight OverLength ctermbg=red ctermfg=white guibg=#592929
" Better filename matching
" Same as VIM default but without '=' and ','
let &isfname="@,48-57,/,.,-,_,+,#,$,%,~"
au BufReadPost * if getfsize(bufname("%")) > 250000 | set syntax= | endif

"#############################################

"" Plugin settings:

" NERDTree
let NERDTreeHijackNetrw=0
let NERDTreeWinSize=40
let NERDTreeIgnore=['\.pyc$']

" TagList
let Tlist_Ctags_Cmd = '/usr/local/bin/ctags'
let Tlist_WinWidth = 50
let g:tlist_php_settings='php;f:function'
let Tlist_Show_One_File = 1
let Tlist_Close_On_Select = 1
let Tlist_GainFocus_On_ToggleOpen = 1

" BufferList (F2)
let g:BufferListMaxWidth = 60

" Rainbow Parentheses
au VimEnter * RainbowParenthesesToggle
au Syntax * RainbowParenthesesLoadRound
au Syntax * RainbowParenthesesLoadSquare
au Syntax * RainbowParenthesesLoadBraces

" CtrlP
let g:ctrlp_match_window_bottom = 0
let g:ctrlp_clear_cache_on_exit = 0
let g:ctrlp_cmd = 'CtrlPLastMode'
let g:ctrlp_max_files = 50000
let g:ctrlp_lazy_update = 100
let g:ctrlp_working_path_mode = '0'

" Gundo
let g:gundo_help = 0
map <Leader>u :GundoToggle<CR>

" Yank Ring
let g:yankring_min_element_length = 1
let g:yankring_manual_clipboard_check = 0
let g:yankring_replace_n_pkey = 'p' " Alt - P
let g:yankring_replace_n_nkey = 'n' " Alt - N
map <Leader>r :YRShow<CR>

" Fugitive
map <Leader>G :Gstatus<CR>

" Jedi-Vim
let g:jedi#rename_command = '<Leader>n'
let g:jedi#related_names = ''

" Supertab
let g:SuperTabDefaultCompletionType = "context"
let g:SuperTabMappingForward = '<c-space>'
let g:SuperTabMappingBackward = '<s-c-space>'

" UtilSnips
let g:UltiSnipsExpandTrigger="<tab>"
let g:UltiSnipsJumpForwardTrigger="<c-j>"
let g:UltiSnipsJumpBackwardTrigger="<c-k>"
let g:UltiSnipsEditSplit="vertical"

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

function! MakeReversibleMapping(name, mapped)
    if !exists("g:satiani_reversible_maps")
        let g:satiani_reversible_maps = {}
    endif

    " Only supports normal mode ("n") for now
    let _current_map = maparg(a:name, "n")
    let g:satiani_reversible_maps[a:name] = _current_map
    if len(_current_map) > 0
        exec("unmap " . a:name)
    endif
    exec("map " . a:name . " " . a:mapped)
endfunction

function! RevertMap(name)
    if exists("g:satiani_reversible_maps[a:name]")
        let _old_map = g:satiani_reversible_maps[a:name]
        exec("unmap " . a:name)
        if len(_old_map) > 0
            exec("map " . a:name . " " . _old_map)
        endif
    else
        exec("unmap " . a:name)
    endif
endfunction

function! RevertAllMaps()
    if exists("g:satiani_reversible_maps")
        for key in keys(g:satiani_reversible_maps)
            call RevertMap(key)
        endfor
    endif
endfunction

function! ToggleOverLengthMatch()
    if !exists("b:overlength_match_flag")
        "TODO: find a way to use a variable in the pattern used in the match
        "command. Without this, we'll have to use hardcoded overlength
        "thresholds. Using 'execute' trick doesn't work for some reason.
        match OverLength /\%111v.*/
        let b:overlength_match_flag = 1
        let b:previous_text_width = &tw
        setlocal tw=110
        echo "Changed textwidth to 110"
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

function! ToggleCursorLine(buf_name)
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
        let register .= ": " . curr_contents
    endif
    call setreg('*', register)
endfunction

function WriteCreatingDirs()
    execute ':silent !mkdir -p %:h'
    write
endfunction

function! PutClockMd5Sum()
    let md5 = system("date +%F%R%N | md5 | cut -d ' ' -f1")
    let md5 = tr(md5, "\n", " ")
    let result = feedkeys("a" . md5)
endfunction

"#############################################

" load files in a directory that is not tracked by git
let local_path="$HOME/.vim/local/*.vim"
if glob(local_path) != ""
    for f in split(glob(local_path), '\n')
        exec("source " . f)
    endfor
endif
