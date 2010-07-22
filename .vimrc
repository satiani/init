" Vim Options
set wildmenu
set hidden
set t_Co=256
set completeopt=longest,menuone
set directory=/home/satiani/vimswap/
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

" Key mappings
inoremap <silent><A-Left> <Esc>:tabprevious<CR>
inoremap <silent><A-Right> <Esc>:tabnext<CR>
map \ :n<CR>
map - :prev<CR>
map <c-w>F <c-w>_<c-w><bar>
map <c-w>O <c-w>w<c-w>_<c-w><bar>
map <silent> <F2> :call BufferList()<CR>
map <silent><A-Down> :tabnew<CR>
map <silent><A-Left> :tabprevious<CR>
map <silent><A-Right> :tabnext<CR>
map <silent><A-Up> :tabnew .<CR>
map <silent><F3>  :TlistToggle<CR>
map <F8> :!/usr/bin/ctags -R --c++-kinds=+p --fields=+iaS --extra=+q .<CR>

" Utility functions
function! CHANGE_CURR_DIR()
    if !exists("b:eclim_temp_window")
        let _dir = expand("%:p:h")
        exec join(["cd", escape(_dir, " ")])
        unlet _dir
    endif
endfunction

function! SET_PHP_STYLE()
    set sw=2
    set sts=2
endfunction

" General Settings
" disable the following command when using eclim
"au BufEnter * call CHANGE_CURR_DIR()
au FileType php call SET_PHP_STYLE()

syntax on
colorscheme desert256
highlight OverLength ctermbg=red ctermfg=white guibg=#592929
"match OverLength /\%81v.*/
let Tlist_WinWidth = 50

" Python extensions
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
