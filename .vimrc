" Vim Options
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
set modeline
set tags=tags;/
set laststatus=2
set statusline=%<%f\ %h%m%r%=%-14.(%l,%c%V%)\ %P
set grepprg=ack
set ignorecase
set smartcase
filetype plugin on
"" NERDTree settings
let NERDTreeHijackNetrw=0
let NERDTreeWinSize=40

"" command-t settings
let g:CommandTMatchWindowAtTop=1
let g:CommandTMaxHeight=10
let g:CommandTMaxFiles=20000
" map cancel to Escape
let g:CommandTCancelMap=''

" Better filename matching
" Same as VIM default but without '=' and ','
let &isfname="@,48-57,/,.,-,_,+,#,$,%,~"

" Key mappings
inoremap <silent><A-Left> <Esc>:tabprevious<CR>
inoremap <silent><A-Right> <Esc>:tabnext<CR>
inoremap  
let mapleader=","
map <F1> <nop>
map <Leader>\ :n<CR>
map <Leader>- :prev<CR>
map <Leader>q :botright cwindow<CR>
map <Leader>n :cnewer<CR>
map <Leader>p :colder<CR>
" Replace word under cursor
map <Leader>s :%s/\<<C-r><C-w>\>/
map <Leader>S :%s/\(\<<C-r><C-w>\>\)/
map <c-w>F <c-w>_<c-w><bar>
map <c-w>O <c-w>w<c-w>_<c-w><bar>
map <silent><A-Down> :tabnew<CR>
map <silent><A-Left> :tabprevious<CR>
map <silent><A-Right> :tabnext<CR>
map <silent><A-Up> :tabnew .<CR>
map <silent><F3>  :let NERDTreeQuitOnOpen=1<CR>:call SwitchToNerdTree()<CR>
map <silent><F4>  :let NERDTreeQuitOnOpen=0<CR>:call SwitchToNerdTree()<CR>
map <silent> <F2> :call BufferList()<CR>
map <silent>  :call ToggleOverLengthMatch()<CR>

" Utility functions
function! ChangeCurrDir()
    if !exists("b:eclim_temp_window")
        let _dir = expand("%:p:h")
        exec join(["cd", escape(_dir, " ")])
        echo "Changed current directory to " . _dir
        unlet _dir
    endif
endfunction

function! SwitchToNerdTree()
    if exists("t:NERDTreeBufName")
        let winnr = bufwinnr(t:NERDTreeBufName)
        let currwinnr = bufwinnr("%")
        if winnr != -1 && winnr != currwinnr
            exec(winnr . "wincmd w")
            return
        endif
    endif

    NERDTreeToggle
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

function! SetTwoLineStyle()
    set sw=2
    set sts=2
endfunction

" Inspired by VIM tip 1380
" http://vim.wikia.com/wiki/Highlight_cursor_line_after_cursor_jump
function s:Cursor_Moved()
  let cur_pos = line(".")
  if g:last_pos == 0
    let g:last_pos = cur_pos
    return
  endif
  let diff = g:last_pos - cur_pos
  if diff > 1 || diff < -1
    set cul
  else
    set nocul
  endif
  let g:last_pos = cur_pos
endfunction

" General Settings
au FileType ruby call SetTwoLineStyle()
au BufRead,BufNewFile *.thrift set filetype=thrift
let g:last_pos = 0
autocmd CursorMoved,CursorMovedI * call s:Cursor_Moved()
syntax on
colorscheme desert256
highlight OverLength ctermbg=red ctermfg=white guibg=#592929
let Tlist_WinWidth = 50
" For BufferList (F2)
let g:BufferListMaxWidth = 60

" For Command-T
let g:CommandTMaxHeight = 10

" Python extensions
if has("python")
python << EOF
import vim
def SetBreakpoint():
    import re
    nLine = int( vim.eval('line(".")'))

    strLine = vim.current.line
    strWhite = re.search('^(\s*)', strLine).group(1)

    vim.current.buffer.append(
        "%(space)spdb.set_trace() %(mark)s Breakpoint %(mark)s" %
        {'space':strWhite, 'mark': '#'*30}, nLine - 1)

    for strLine in vim.current.buffer:
        if strLine == "import pdb":
            break
    else:
        vim.current.buffer.append('import pdb', 0)
        vim.command('normal j1')


def RemoveBreakpoints():
    import re

    nCurrentLine = int( vim.eval( 'line(".")'))

    nLines = []
    nLine = 1
    for strLine in vim.current.buffer:
        if strLine == 'import pdb' or strLine.lstrip()[:15] == 'pdb.set_trace()':
            nLines.append( nLine)
        nLine += 1

    nLines.reverse()

    for nLine in nLines:
        vim.command( 'normal %dG' % nLine)
        vim.command( 'normal dd')
        if nLine < nCurrentLine:
            nCurrentLine -= 1

    vim.command( 'normal %dG' % nCurrentLine)

def EvaluateCurrentRange():
    print "#" * 30
    eval(compile('\n'.join(vim.current.range),'','exec'), globals())
    print "#" * 30

#vim.command( 'map <s-f7> :py RemoveBreakpoints()<cr>')
#vim.command('map <f7> :py SetBreakpoint()<cr>')
vim.command( 'map <C-h> :py EvaluateCurrentRange()<cr>')
EOF
endif

let local_path="$HOME/.vim/local/*.vim"
if glob(local_path) != ""
    exec("source " . local_path)
endif
